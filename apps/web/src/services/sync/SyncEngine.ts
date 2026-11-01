import { logActivity, TAB_ID } from '../../database/activity';
import { META_KEYS, setMeta, type AirgapDatabase, type QueuedMutation } from '../../database/db';
import { refreshSyncStatus } from '../../database/incidentStore';
import type { ApiClient } from '../api/client';
import { applyOutcome, sendMutation } from './MutationProcessor';
import { pullEvents } from './RemoteSync';
import type { SyncCoordinator } from './SyncCoordinator';

export type SyncPhase = 'idle' | 'running' | 'waiting-retry' | 'offline' | 'error';

export interface SyncEngineState {
  phase: SyncPhase;
  /** Mutation currently on the wire (for the visualizer). */
  activeMutationId: string | null;
  lastRunStartedAt: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  /** Another tab held the sync lock on the last attempt. */
  lockedByOtherTab: boolean;
  lastRun: { acked: number; conflicts: number; failed: number; retried: number } | null;
}

export interface SyncEngineDeps {
  db: AirgapDatabase;
  api: ApiClient;
  coordinator: SyncCoordinator;
  /** True only when the backend is actually reachable (not just navigator.onLine). */
  isConnected: () => boolean;
  getSessionId: () => string | undefined;
  /**
   * Returns a usable demo session id, creating one if needed. When
   * `expiredId` is given and still current, a replacement is created.
   */
  obtainSession: (expiredId?: string) => Promise<string>;
  now?: () => Date;
  random?: () => number;
  /** Safety-net poll interval while mutations are pending. */
  pollIntervalMs?: number;
}

export interface SyncRequest {
  /** Ignore backoff timers (manual "SYNC NOW", or connectivity just returned). */
  force?: boolean;
  reason: string;
}

const INITIAL_STATE: SyncEngineState = {
  phase: 'idle',
  activeMutationId: null,
  lastRunStartedAt: null,
  lastSuccessAt: null,
  lastDurationMs: null,
  lastError: null,
  nextRetryAt: null,
  lockedByOtherTab: false,
  lastRun: null,
};

/**
 * Drains the durable mutation queue to the server.
 *
 * Invariants:
 * - Mutations are processed strictly in queue (`seq`) order.
 * - A mutation is removed only after the server acknowledged it (incl. an
 *   idempotent replay of an earlier acknowledgement).
 * - Per entity, nothing is sent while an earlier mutation for that entity is
 *   unacknowledged, in conflict, or failed — so an UPDATE can never overtake
 *   its CREATE.
 * - A retryable failure (network, 5xx) stops the run and schedules a retry
 *   with exponential backoff + jitter; it does not spin.
 * - Only the tab holding the cross-tab lock sends anything.
 */
export class SyncEngine {
  private state: SyncEngineState = INITIAL_STATE;
  private readonly listeners = new Set<(state: SyncEngineState) => void>();
  private running = false;
  private rerun: SyncRequest | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeCoordinator: (() => void) | null = null;
  private loggedOfflineSkip = false;

  constructor(private readonly deps: SyncEngineDeps) {}

  getState(): SyncEngineState {
    return this.state;
  }

  subscribe(listener: (state: SyncEngineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.unsubscribeCoordinator = this.deps.coordinator.subscribe((message) => {
      if (message.from === TAB_ID) return;
      if (message.type === 'sync-requested')
        void this.requestSync({ reason: 'another tab queued work' });
    });
    this.pollTimer = setInterval(() => {
      void this.requestSync({ reason: 'periodic check' });
    }, this.deps.pollIntervalMs ?? 15_000);
    void this.requestSync({ reason: 'startup', force: true });
  }

  stop(): void {
    this.unsubscribeCoordinator?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
  }

  /** Called after a local write: try now, and wake up other tabs. */
  notifyLocalWrite(): void {
    this.deps.coordinator.broadcast({ type: 'sync-requested', from: TAB_ID });
    void this.requestSync({ reason: 'local write' });
  }

  async requestSync(request: SyncRequest): Promise<void> {
    if (this.running) {
      // Coalesce: one more pass after the current one, keeping the strongest flags.
      this.rerun = { reason: request.reason, force: Boolean(this.rerun?.force || request.force) };
      return;
    }
    this.running = true;
    try {
      await this.runOnce(request);
    } finally {
      this.running = false;
    }
    if (this.rerun) {
      const next = this.rerun;
      this.rerun = null;
      await this.requestSync(next);
    }
  }

  private setState(patch: Partial<SyncEngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async runOnce(request: SyncRequest): Promise<void> {
    const { db } = this.deps;
    const pendingCount = await db.mutationQueue.count();
    // The safety-net poll only matters when there is something to push; the
    // realtime channel takes care of pulling remote changes.
    if (request.reason === 'periodic check' && pendingCount === 0) return;

    if (!this.deps.isConnected()) {
      if (pendingCount > 0 && !this.loggedOfflineSkip) {
        this.loggedOfflineSkip = true;
        await logActivity(db, {
          type: 'SYNC_SKIPPED_OFFLINE',
          category: 'sync',
          level: 'info',
          message: `Backend unreachable — ${pendingCount} mutation(s) held safely in IndexedDB`,
          meta: { pending: pendingCount },
        });
      }
      this.setState({ phase: 'offline', activeMutationId: null });
      return;
    }
    this.loggedOfflineSkip = false;

    const outcome = await this.deps.coordinator.withLock(() => this.drain(request, pendingCount));
    if (!outcome.acquired) {
      this.setState({ lockedByOtherTab: true, phase: pendingCount > 0 ? 'running' : 'idle' });
      // Retry soon: the other tab may be closed mid-run.
      this.scheduleRetry(new Date(this.now().getTime() + 3000));
      return;
    }
    if (this.state.lockedByOtherTab) this.setState({ lockedByOtherTab: false });
  }

  /** The critical section: runs only while this tab holds the sync lock. */
  private async drain(request: SyncRequest, pendingAtStart: number): Promise<void> {
    const { db, api } = this.deps;
    const started = performance.now();
    const startedAt = this.now().toISOString();

    // Recovery: only the lock holder marks mutations `syncing`, so any we find
    // now were interrupted (tab closed / reloaded mid-request). Send them again —
    // the idempotency key makes that safe even if the server already applied them.
    const interrupted = await db.mutationQueue.where('status').equals('syncing').toArray();
    if (interrupted.length > 0) {
      await db.transaction('rw', db.incidents, db.mutationQueue, db.activityEvents, async () => {
        for (const m of interrupted) {
          await db.mutationQueue.update(m.seq!, { status: 'queued' });
          await refreshSyncStatus(db, m.entityId);
        }
        await logActivity(db, {
          type: 'SYNC_RECOVERED_INTERRUPTED',
          category: 'sync',
          level: 'warning',
          message: `Recovered ${interrupted.length} mutation(s) interrupted mid-sync — they will be resent with their original idempotency keys`,
        });
      });
    }

    if (!this.deps.getSessionId()) {
      try {
        await this.deps.obtainSession();
      } catch (error) {
        this.setState({ phase: 'error', lastError: messageOf(error) });
        return;
      }
    }

    const tally = { acked: 0, conflicts: 0, failed: 0, retried: 0 };
    if (pendingAtStart > 0) {
      this.setState({
        phase: 'running',
        lastRunStartedAt: startedAt,
        lastError: null,
        nextRetryAt: null,
      });
      await logActivity(db, {
        type: 'SYNC_STARTED',
        category: 'sync',
        level: 'info',
        message: `Synchronization started — ${pendingAtStart} pending mutation(s) (${request.reason})`,
        meta: { pending: pendingAtStart, reason: request.reason },
      });
    }

    const blocked = new Set<string>();
    let stoppedForRetry: Date | null = null;
    let sessionRecreated = false;

    for (;;) {
      const next = await this.nextProcessable(blocked, request.force ?? false);
      if (next.kind === 'done') break;
      if (next.kind === 'wait') {
        stoppedForRetry = next.until;
        break;
      }
      const mutation = next.mutation;
      if (!this.deps.isConnected()) {
        stoppedForRetry = null;
        break;
      }

      await db.transaction('rw', db.incidents, db.mutationQueue, async () => {
        await db.mutationQueue.update(mutation.seq!, {
          status: 'syncing',
          attempts: mutation.attempts + 1,
        });
        await refreshSyncStatus(db, mutation.entityId);
      });
      this.setState({ activeMutationId: mutation.id });

      const result = await sendMutation(api, mutation);

      if (result.kind === 'session-expired' && !sessionRecreated) {
        sessionRecreated = true;
        await applyOutcome(db, mutation, result);
        await logActivity(db, {
          type: 'SESSION_EXPIRED',
          category: 'server',
          level: 'warning',
          message:
            'Demo session expired on the server — creating a new one; pending creates will be replayed into it',
        });
        try {
          await this.deps.obtainSession(this.deps.getSessionId());
          continue;
        } catch (error) {
          this.setState({ phase: 'error', lastError: messageOf(error) });
          break;
        }
      }

      await applyOutcome(
        db,
        mutation,
        result.kind === 'session-expired'
          ? { kind: 'failed', code: 'SESSION_NOT_FOUND', message: result.message }
          : result,
        {
          now: this.deps.now,
          random: this.deps.random,
        },
      );

      if (result.kind === 'acked') tally.acked++;
      else if (result.kind === 'conflict') {
        tally.conflicts++;
        blocked.add(mutation.entityId);
      } else if (result.kind === 'failed' || result.kind === 'session-expired') {
        tally.failed++;
        blocked.add(mutation.entityId);
      } else if (result.kind === 'retry') {
        tally.retried++;
        const updated = await db.mutationQueue.get(mutation.seq!);
        if (updated?.status === 'failed') {
          blocked.add(mutation.entityId);
          continue;
        }
        // Network trouble affects everything behind it too: stop and back off.
        stoppedForRetry = updated?.nextRetryAt
          ? new Date(updated.nextRetryAt)
          : new Date(this.now().getTime() + 1000);
        break;
      }
    }

    // Catch up on server-side changes made while we were away.
    let pullError: string | null = null;
    if (this.deps.isConnected() && !stoppedForRetry) {
      try {
        await pullEvents(db, api);
      } catch (error) {
        pullError = messageOf(error);
      }
    }

    const durationMs = Math.round(performance.now() - started);
    const remaining = await db.mutationQueue.count();
    const blockedCount = await db.mutationQueue.where('status').anyOf('conflict', 'failed').count();

    if (stoppedForRetry) {
      this.setState({
        phase: 'waiting-retry',
        activeMutationId: null,
        nextRetryAt: stoppedForRetry.toISOString(),
        lastDurationMs: durationMs,
        lastRun: tally,
      });
      this.scheduleRetry(stoppedForRetry);
      return;
    }

    const finishedAt = this.now().toISOString();
    const hadWork = pendingAtStart > 0 || tally.acked > 0;
    await setMeta(db, META_KEYS.lastSyncAt, finishedAt);
    if (hadWork) await setMeta(db, META_KEYS.lastSyncDurationMs, durationMs);

    if (hadWork) {
      const clean = remaining === 0;
      await logActivity(db, {
        type: clean ? 'SYNC_COMPLETE' : blockedCount > 0 ? 'SYNC_NEEDS_ATTENTION' : 'SYNC_COMPLETE',
        category: 'sync',
        level: clean ? 'success' : 'warning',
        message: clean
          ? `Synchronization complete — ${tally.acked} mutation(s) acknowledged in ${durationMs} ms`
          : `Sync pass finished in ${durationMs} ms — ${tally.acked} acknowledged, ${blockedCount} need attention`,
        meta: { ...tally, durationMs, remaining },
      });
      this.deps.coordinator.broadcast({ type: 'sync-finished', from: TAB_ID, acked: tally.acked });
    }

    this.setState({
      phase: pullError ? 'error' : 'idle',
      activeMutationId: null,
      lastSuccessAt: finishedAt,
      lastDurationMs: hadWork ? durationMs : this.state.lastDurationMs,
      lastError: pullError,
      nextRetryAt: null,
      lastRun: hadWork ? tally : this.state.lastRun,
    });
  }

  private async nextProcessable(
    blocked: Set<string>,
    force: boolean,
  ): Promise<
    { kind: 'send'; mutation: QueuedMutation } | { kind: 'wait'; until: Date } | { kind: 'done' }
  > {
    const queue = await this.deps.db.mutationQueue.orderBy('seq').toArray();
    const now = this.now().getTime();
    for (const mutation of queue) {
      if (blocked.has(mutation.entityId)) continue;
      if (mutation.status === 'conflict' || mutation.status === 'failed') {
        blocked.add(mutation.entityId);
        continue;
      }
      if (!force && mutation.nextRetryAt && Date.parse(mutation.nextRetryAt) > now) {
        return { kind: 'wait', until: new Date(mutation.nextRetryAt) };
      }
      return { kind: 'send', mutation };
    }
    return { kind: 'done' };
  }

  private scheduleRetry(at: Date): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = Math.max(0, at.getTime() - this.now().getTime());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.requestSync({ reason: 'scheduled retry' });
    }, delay);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
