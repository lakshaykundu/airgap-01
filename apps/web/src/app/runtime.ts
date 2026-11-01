import { incidentCode, type IncidentFields } from '@airgap/shared';
import { logActivity } from '../database/activity';
import { AirgapDatabase, META_KEYS, getMeta, type LocalIncident } from '../database/db';
import {
  createIncidentLocally,
  deleteIncidentLocally,
  updateIncidentLocally,
} from '../database/incidentStore';
import { ApiClient } from '../services/api/client';
import { RealtimeChannel } from '../services/api/realtime';
import { Transport } from '../services/api/transport';
import { ConnectivityMonitor } from '../services/connectivity/ConnectivityMonitor';
import { deriveConnection } from '../services/connectivity/connectionState';
import {
  acceptServerVersion,
  discardMutationsFor,
  keepLocalChanges,
  mergeChanges,
  retryFailedMutations,
} from '../services/sync/ConflictResolver';
import { createSession, fullRefresh } from '../services/sync/RemoteSync';
import { SyncCoordinator } from '../services/sync/SyncCoordinator';
import { SyncEngine } from '../services/sync/SyncEngine';
import type { AppStore } from '../store';
import { connectivityActions } from '../store/connectivitySlice';
import {
  SIMULATOR_STORAGE_KEY,
  loadSimulatorConfig,
  simulatorActions,
} from '../store/simulatorSlice';
import { uiActions } from '../store/uiSlice';

export type BootStepId = 'storage' | 'offline' | 'data';
export type BootStepStatus = 'pending' | 'active' | 'done' | 'warning' | 'error';
export type BootReporter = (id: BootStepId, status: BootStepStatus, detail?: string) => void;

export class StorageInitError extends Error {
  override readonly name = 'StorageInitError';
}

/**
 * Wires the offline-first services together. Exactly one Runtime exists per
 * tab. React reads data through Dexie live queries and Redux; all writes go
 * through the methods below so every local write also wakes the sync engine.
 */
export class Runtime {
  readonly db: AirgapDatabase;
  readonly transport: Transport;
  readonly api: ApiClient;
  readonly monitor: ConnectivityMonitor;
  readonly coordinator: SyncCoordinator;
  readonly engine: SyncEngine;
  readonly realtime: RealtimeChannel;
  private sessionId: string | undefined;
  private wasReachable = false;
  private readonly disposers: (() => void)[] = [];

  constructor(
    readonly store: AppStore,
    db?: AirgapDatabase,
  ) {
    this.db = db ?? new AirgapDatabase();
    this.transport = new Transport({
      getConfig: () => store.getState().simulator,
      getSessionId: () => this.sessionId,
      onDropConsumed: () => store.dispatch(simulatorActions.consumeDropNextResponse()),
      onOutcome: (entry, error) => this.monitor.reportRequest(entry, error),
      isBrowserOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    });
    this.api = new ApiClient(this.transport);
    this.monitor = new ConnectivityMonitor({
      api: this.api,
      isSimulatedDisconnect: () => store.getState().simulator.disconnected,
    });
    this.coordinator = new SyncCoordinator();
    this.engine = new SyncEngine({
      db: this.db,
      api: this.api,
      coordinator: this.coordinator,
      isConnected: () => this.canReachBackend(),
      getSessionId: () => this.sessionId,
      obtainSession: (expiredId) => this.ensureSession(expiredId),
    });
    this.realtime = new RealtimeChannel({
      db: this.db,
      api: this.api,
      getSessionId: () => this.sessionId,
      canConnect: () => this.canReachBackend(),
      preferPolling: () => this.monitor.getSnapshot().realtimeTransport === 'poll',
      onModeChange: (mode) => store.dispatch(connectivityActions.realtimeUpdated(mode)),
    });
  }

  get currentSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Creates the demo session at most once across all tabs (Web Lock). */
  async ensureSession(expiredId?: string): Promise<string> {
    const id = await this.coordinator.runExclusive('session', async () => {
      const stored = await getMeta<string>(this.db, META_KEYS.sessionId);
      if (stored && stored !== expiredId) return stored;
      return createSession(this.db, this.api);
    });
    if (id !== this.sessionId) {
      this.sessionId = id;
      this.realtime.refresh();
    }
    return id;
  }

  canReachBackend(): boolean {
    const { monitor, sync } = this.store.getState().connectivity;
    return deriveConnection({
      browserOnline: monitor.browserOnline,
      simulatedDisconnect: this.store.getState().simulator.disconnected,
      backendReachable: monitor.backendReachable,
      checking: monitor.checking,
      degraded: monitor.degraded,
      syncPhase: sync.phase,
      hasSyncError: Boolean(sync.lastError),
    }).canReachBackend;
  }

  // ── boot ────────────────────────────────────────────────────────────────
  async boot(report: BootReporter): Promise<void> {
    report('storage', 'active');
    try {
      await this.db.open();
      const persisted = await navigator.storage?.persist?.().catch(() => false);
      report(
        'storage',
        'done',
        `IndexedDB v${this.db.verno} open${persisted ? ' · persistent storage granted' : ''}`,
      );
    } catch (error) {
      report('storage', 'error', error instanceof Error ? error.message : String(error));
      throw new StorageInitError(
        error instanceof Error ? error.message : 'IndexedDB could not be opened',
      );
    }

    report('offline', 'active');
    this.sessionId = await getMeta<string>(this.db, META_KEYS.sessionId);
    const queued = await this.db.mutationQueue.count();
    this.store.dispatch(connectivityActions.lockMechanismDetected(this.coordinator.mechanism));
    const swDetail = !('serviceWorker' in navigator)
      ? 'service worker unsupported'
      : import.meta.env.DEV
        ? 'service worker disabled in dev mode'
        : navigator.serviceWorker.controller
          ? 'app shell served from service worker cache'
          : 'service worker installing (first visit)';
    report('offline', 'done', `${swDetail} · ${queued} queued mutation(s) restored`);

    report('data', 'active');
    const localCount = await this.db.incidents.count();
    this.wire();
    if (!this.sessionId) {
      // First visit: we need the server once to create the demo workspace.
      const reachable = this.store.getState().simulator.disconnected
        ? false
        : await this.monitor.check();
      if (reachable) {
        try {
          await this.ensureSession();
          report(
            'data',
            'done',
            `demo session created · ${await this.db.incidents.count()} incidents cached locally`,
          );
        } catch (error) {
          report(
            'data',
            'warning',
            `could not create demo session (${error instanceof Error ? error.message : 'error'}) — working locally`,
          );
        }
      } else {
        report(
          'data',
          'warning',
          'no connection on first visit — working locally; the workspace will be created on reconnect',
        );
      }
    } else {
      report('data', 'done', `${localCount} incidents loaded from IndexedDB`);
    }

    this.engine.start();
    this.monitor.start();
    this.realtime.refresh();
    await logActivity(this.db, {
      type: 'APP_STARTED',
      category: 'system',
      level: 'info',
      message: `Console started · ${localCount} local incidents · ${queued} queued mutation(s)`,
    });
  }

  private wire(): void {
    const { store } = this;
    this.disposers.push(
      this.monitor.subscribe((snapshot) => {
        const previous = store.getState().connectivity.monitor;
        store.dispatch(connectivityActions.monitorUpdated(snapshot));
        if (previous.browserOnline !== snapshot.browserOnline) {
          void logActivity(this.db, {
            type: snapshot.browserOnline ? 'BROWSER_ONLINE' : 'BROWSER_OFFLINE',
            category: 'network',
            level: snapshot.browserOnline ? 'success' : 'warning',
            message: snapshot.browserOnline
              ? 'Browser regained network connectivity'
              : 'Browser went offline (navigator.onLine = false)',
          });
        }
        if (
          snapshot.backendReachable !== null &&
          previous.backendReachable !== snapshot.backendReachable &&
          !store.getState().simulator.disconnected
        ) {
          void logActivity(this.db, {
            type: snapshot.backendReachable ? 'BACKEND_REACHABLE' : 'BACKEND_UNREACHABLE',
            category: 'network',
            level: snapshot.backendReachable ? 'success' : 'warning',
            message: snapshot.backendReachable
              ? `Backend reachable (health probe ${snapshot.lastLatencyMs ?? '—'} ms)`
              : `Backend unreachable${snapshot.lastFailure ? ` — ${snapshot.lastFailure}` : ''}`,
          });
        }
        this.onReachabilityMaybeChanged();
      }),
      this.engine.subscribe((state) => {
        store.dispatch(connectivityActions.syncUpdated(state));
      }),
      this.coordinator.subscribe((message) => {
        if (message.type === 'simulator-changed')
          store.dispatch(simulatorActions.hydrate(loadSimulatorConfig()));
      }),
    );

    // Simulator settings are shared by every tab of this browser.
    const onStorage = (event: StorageEvent) => {
      if (event.key === SIMULATOR_STORAGE_KEY) {
        store.dispatch(simulatorActions.hydrate(loadSimulatorConfig()));
        this.onSimulatorChanged();
      }
    };
    window.addEventListener('storage', onStorage);
    this.disposers.push(() => window.removeEventListener('storage', onStorage));
    this.wasReachable = this.canReachBackend();
  }

  private onReachabilityMaybeChanged(): void {
    const reachable = this.canReachBackend();
    if (reachable === this.wasReachable) return;
    this.wasReachable = reachable;
    this.realtime.refresh();
    if (reachable) void this.engine.requestSync({ reason: 'connectivity restored', force: true });
    else void this.engine.requestSync({ reason: 'connectivity lost' });
  }

  private onSimulatorChanged(): void {
    if (!this.store.getState().simulator.disconnected) void this.monitor.check();
    this.onReachabilityMaybeChanged();
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.engine.stop();
    this.monitor.stop();
    this.realtime.stop();
    this.coordinator.close();
  }

  // ── commands (all local-first) ─────────────────────────────────────────
  async createIncident(fields: IncidentFields): Promise<LocalIncident> {
    const incident = await createIncidentLocally(this.db, fields);
    this.engine.notifyLocalWrite();
    return incident;
  }

  async updateIncident(id: string, changes: Partial<IncidentFields>): Promise<LocalIncident> {
    const incident = await updateIncidentLocally(this.db, id, changes);
    this.engine.notifyLocalWrite();
    return incident;
  }

  async deleteIncident(id: string): Promise<'cancelled-locally' | 'queued'> {
    const result = await deleteIncidentLocally(this.db, id);
    this.engine.notifyLocalWrite();
    return result;
  }

  syncNow(): Promise<void> {
    if (!this.canReachBackend()) void this.monitor.check();
    return this.engine.requestSync({ reason: 'manual sync', force: true });
  }

  async retryFailed(entityId?: string): Promise<number> {
    const count = await retryFailedMutations(this.db, entityId);
    this.engine.notifyLocalWrite();
    return count;
  }

  async discard(entityId: string): Promise<void> {
    await discardMutationsFor(this.db, entityId);
    if (this.canReachBackend()) await fullRefresh(this.db, this.api).catch(() => undefined);
  }

  async resolveConflict(
    entityId: string,
    strategy: 'keep-local' | 'accept-server' | 'merge',
    merged?: IncidentFields,
  ): Promise<void> {
    if (strategy === 'keep-local') await keepLocalChanges(this.db, entityId);
    else if (strategy === 'accept-server') await acceptServerVersion(this.db, entityId);
    else if (merged) await mergeChanges(this.db, entityId, merged);
    this.engine.notifyLocalWrite();
  }

  // ── chaos lab ───────────────────────────────────────────────────────────
  async setSimulatedDisconnect(disconnected: boolean): Promise<void> {
    this.store.dispatch(simulatorActions.setDisconnected(disconnected));
    await logActivity(this.db, {
      type: disconnected ? 'SIMULATED_DISCONNECT' : 'SIMULATED_RESTORE',
      category: 'simulator',
      level: disconnected ? 'warning' : 'success',
      message: disconnected
        ? 'Simulated API disconnection ON — all backend requests are rejected by the transport'
        : 'Simulated API disconnection OFF — verifying backend health',
    });
    this.onSimulatorChanged();
    if (!disconnected) {
      const ok = await this.monitor.check();
      this.onReachabilityMaybeChanged();
      if (ok) await this.engine.requestSync({ reason: 'connection restored', force: true });
    }
  }

  async logSimulator(message: string): Promise<void> {
    await logActivity(this.db, {
      type: 'SIMULATOR_CONFIG',
      category: 'simulator',
      level: 'info',
      message,
    });
  }

  /** Demo-only: a genuine server-side edit by a "remote colleague". */
  async triggerRemoteEdit(incidentId?: string): Promise<string> {
    const res = await this.api.remoteEdit(incidentId);
    await logActivity(this.db, {
      type: 'REMOTE_EDIT_TRIGGERED',
      category: 'simulator',
      level: 'warning',
      message: `Server-side edit to ${incidentCode(res.data.incident.id)} (now v${res.data.incident.version}) — ${res.data.changedFields.join(', ')}`,
      entityId: res.data.incident.id,
    });
    return res.data.incident.id;
  }

  /**
   * Out-of-band remote edit for the conflict walkthrough. It represents ANOTHER
   * operator's device, so it deliberately bypasses this tab's simulated
   * disconnect (but not a real browser outage). The UI labels it as such.
   */
  async remoteEditOutOfBand(incidentId: string): Promise<number> {
    if (!this.sessionId) throw new Error('No demo session yet — connect once first');
    const res = await fetch('/api/demo/remote-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-airgap-session': this.sessionId },
      body: JSON.stringify({ incidentId }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Remote edit failed (HTTP ${res.status})`);
    const data = (await res.json()) as { incident: { version: number } };
    await logActivity(this.db, {
      type: 'REMOTE_EDIT_TRIGGERED',
      category: 'simulator',
      level: 'warning',
      message: `Another operator edited ${incidentCode(incidentId)} on the server (now v${data.incident.version}) — out-of-band, bypassing this tab's simulated disconnect`,
      entityId: incidentId,
    });
    return data.incident.version;
  }

  /** Resets this visitor's demo: server session data, local data, queue and simulator. */
  async resetDemo(): Promise<void> {
    const reachable = this.canReachBackend();
    if (reachable && this.sessionId) await this.api.resetSession();
    await this.db.transaction(
      'rw',
      [
        this.db.incidents,
        this.db.mutationQueue,
        this.db.activityEvents,
        this.db.stressTestRecords,
        this.db.syncMetadata,
      ],
      async () => {
        await this.db.incidents.clear();
        await this.db.mutationQueue.clear();
        await this.db.activityEvents.clear();
        await this.db.stressTestRecords.clear();
        if (!reachable) await this.db.syncMetadata.clear();
      },
    );
    this.store.dispatch(simulatorActions.resetSimulator());
    if (!reachable) this.sessionId = undefined;
    await logActivity(this.db, {
      type: 'DEMO_RESET',
      category: 'system',
      level: 'warning',
      message: reachable
        ? 'Demo reset — server session reseeded, local data cleared'
        : 'Local demo data cleared (offline) — a new session will be created on reconnect',
    });
    this.onSimulatorChanged();
    if (reachable) await fullRefresh(this.db, this.api);
    else await this.engine.requestSync({ reason: 'after reset', force: true });
    this.store.dispatch(
      uiActions.pushToast({
        tone: 'success',
        title: 'Demo reset',
        description: 'Fresh workspace ready.',
      }),
    );
  }
}
