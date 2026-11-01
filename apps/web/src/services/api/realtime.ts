import type { ServerEvent } from '@airgap/shared';
import { META_KEYS, getMeta, type AirgapDatabase } from '../../database/db';
import { applyServerEvent, fullRefresh, pullEvents } from '../sync/RemoteSync';
import type { ApiClient } from './client';

export type RealtimeMode = 'off' | 'connecting' | 'live' | 'polling';

export interface RealtimeOptions {
  db: AirgapDatabase;
  api: ApiClient;
  getSessionId: () => string | undefined;
  /** False while offline or while the simulated disconnect is active. */
  canConnect: () => boolean;
  onModeChange?: (mode: RealtimeMode) => void;
  pollIntervalMs?: number;
  sseRetryMs?: number;
}

/**
 * Live server → client change feed. Prefers Server-Sent Events; on stream
 * errors it degrades to polling `/api/events` and periodically retries SSE.
 * Both resume from the cursor persisted in IndexedDB, so nothing is missed
 * across disconnects or reloads.
 */
export class RealtimeChannel {
  private source: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: RealtimeMode = 'off';
  private chain: Promise<unknown> = Promise.resolve();
  private connectingFor: string | null = null;

  constructor(private readonly options: RealtimeOptions) {}

  getMode(): RealtimeMode {
    return this.mode;
  }

  /** Reconciles the channel with current connectivity. Safe to call often. */
  refresh(): void {
    const sessionId = this.options.getSessionId();
    if (!this.options.canConnect() || !sessionId) {
      this.teardown();
      this.setMode('off');
      return;
    }
    if (this.source || this.pollTimer || this.connectingFor === sessionId) return;
    void this.openStream(sessionId);
  }

  stop(): void {
    this.teardown();
    this.setMode('off');
  }

  private setMode(mode: RealtimeMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.options.onModeChange?.(mode);
  }

  private enqueue(task: () => Promise<unknown>): void {
    this.chain = this.chain.then(task).catch(() => undefined);
  }

  private async openStream(sessionId: string): Promise<void> {
    if (typeof EventSource === 'undefined') {
      this.startPolling();
      return;
    }
    this.connectingFor = sessionId;
    this.setMode('connecting');
    const cursor = (await getMeta<number>(this.options.db, META_KEYS.eventCursor)) ?? 0;
    this.connectingFor = null;
    if (!this.options.canConnect() || this.source) return;

    const source = new EventSource(
      `/api/events/stream?session=${encodeURIComponent(sessionId)}&after=${cursor}`,
    );
    this.source = source;
    source.addEventListener('ready', () => this.setMode('live'));
    source.addEventListener('change', (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as ServerEvent;
      this.enqueue(() => applyServerEvent(this.options.db, this.options.api, event));
    });
    source.addEventListener('reset-required', () => {
      this.enqueue(() => fullRefresh(this.options.db, this.options.api));
    });
    source.onerror = () => {
      // Close and fall back to polling; EventSource's own reconnect would keep
      // hammering an unreachable server.
      source.close();
      if (this.source === source) this.source = null;
      if (!this.options.canConnect()) {
        this.setMode('off');
        return;
      }
      this.startPolling();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.stopPolling();
        this.refresh();
      }, this.options.sseRetryMs ?? 30_000);
    };
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.setMode('polling');
    const poll = () => {
      if (!this.options.canConnect()) return;
      this.enqueue(() => pullEvents(this.options.db, this.options.api));
    };
    poll();
    this.pollTimer = setInterval(poll, this.options.pollIntervalMs ?? 10_000);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private teardown(): void {
    this.source?.close();
    this.source = null;
    this.stopPolling();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
