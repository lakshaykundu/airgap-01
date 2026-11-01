import type { ApiClient } from '../api/client';
import { NetworkError, type RequestLogEntry } from '../api/transport';

export interface ConnectivitySnapshot {
  browserOnline: boolean;
  backendReachable: boolean | null;
  checking: boolean;
  lastCheckAt: string | null;
  /** Measured round trip of the last successful health probe. */
  lastLatencyMs: number | null;
  /** A data/mutation request failed recently while the backend was otherwise reachable. */
  degraded: boolean;
  lastFailure: string | null;
}

export interface MonitorOptions {
  api: ApiClient;
  isSimulatedDisconnect: () => boolean;
  onlineIntervalMs?: number;
  offlineIntervalMs?: number;
  degradedWindowMs?: number;
  slowThresholdMs?: number;
}

/**
 * Tracks whether the BACKEND is reachable — not just whether the browser
 * thinks it has a network. Inputs: browser online/offline events, periodic
 * health probes, and the outcome of every real API request.
 */
export class ConnectivityMonitor {
  private snapshot: ConnectivitySnapshot = {
    // Only an explicit `false` means offline (non-browser runtimes may omit onLine).
    browserOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
    backendReachable: null,
    checking: false,
    lastCheckAt: null,
    lastLatencyMs: null,
    degraded: false,
    lastFailure: null,
  };
  private readonly listeners = new Set<(snapshot: ConnectivitySnapshot) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastDataFailureAt = 0;
  private inFlight: Promise<boolean> | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly options: MonitorOptions) {}

  getSnapshot(): ConnectivitySnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: ConnectivitySnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (typeof window !== 'undefined') {
      const online = () => {
        this.update({ browserOnline: true });
        void this.check();
      };
      const offline = () => this.update({ browserOnline: false, backendReachable: false });
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      this.cleanup.push(() => window.removeEventListener('online', online));
      this.cleanup.push(() => window.removeEventListener('offline', offline));
    }
    void this.check();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const fn of this.cleanup) fn();
    this.listeners.clear();
  }

  /** Probes /api/health. Concurrent callers share one in-flight probe. */
  check(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.probe().finally(() => {
      this.inFlight = null;
      this.schedule();
    });
    return this.inFlight;
  }

  private async probe(): Promise<boolean> {
    if (!this.snapshot.browserOnline) {
      this.update({ backendReachable: false, checking: false });
      return false;
    }
    this.update({ checking: true });
    try {
      const res = await this.options.api.health();
      this.update({
        backendReachable: true,
        checking: false,
        lastCheckAt: new Date().toISOString(),
        lastLatencyMs: res.durationMs,
        degraded: this.isDegraded(res.durationMs),
        lastFailure: null,
      });
      return true;
    } catch (error) {
      this.update({
        backendReachable: false,
        checking: false,
        lastCheckAt: new Date().toISOString(),
        lastFailure: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Fed by the transport after every request. */
  reportRequest(entry: RequestLogEntry, error?: unknown): void {
    if (entry.kind === 'health') return;
    if (entry.ok) {
      if (this.snapshot.backendReachable !== true) {
        this.update({ backendReachable: true, lastFailure: null });
      }
      this.update({ degraded: this.isDegraded(entry.durationMs) });
      return;
    }
    if (error instanceof NetworkError) {
      if (error.kind === 'network' || error.kind === 'timeout') {
        // A real transport failure: confirm with a probe rather than guessing.
        this.lastDataFailureAt = Date.now();
        void this.check();
      } else if (error.kind === 'simulated-failure' || error.kind === 'response-lost') {
        this.lastDataFailureAt = Date.now();
        this.update({ degraded: true, lastFailure: error.message });
      }
    } else if (entry.outcome.startsWith('5')) {
      this.lastDataFailureAt = Date.now();
      this.update({ degraded: true, lastFailure: `Server error ${entry.outcome}` });
    }
  }

  private isDegraded(latencyMs: number): boolean {
    const recentFailure =
      Date.now() - this.lastDataFailureAt < (this.options.degradedWindowMs ?? 20_000);
    return recentFailure || latencyMs > (this.options.slowThresholdMs ?? 1200);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const reachable = this.snapshot.backendReachable && !this.options.isSimulatedDisconnect();
    const delay = reachable
      ? (this.options.onlineIntervalMs ?? 15_000)
      : (this.options.offlineIntervalMs ?? 5_000);
    this.timer = setTimeout(() => void this.check(), delay);
  }

  private update(patch: Partial<ConnectivitySnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    const changed = (Object.keys(patch) as (keyof ConnectivitySnapshot)[]).some(
      (key) => next[key] !== this.snapshot[key],
    );
    if (!changed) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
