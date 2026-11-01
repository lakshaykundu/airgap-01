import {
  IDEMPOTENCY_HEADER,
  REPLAY_HEADER,
  SESSION_HEADER,
  createRng,
  type ApiErrorBody,
  type ErrorCode,
} from '@airgap/shared';

/**
 * Chaos Lab settings. These are applied INSIDE the transport, so every backend
 * request the app makes is affected — not just a status badge.
 */
export interface SimulatorConfig {
  /** Simulated API disconnection: requests are rejected before reaching the network. */
  disconnected: boolean;
  latencyPreset: 'normal' | '3g' | '2g' | 'custom';
  /** Injected delay before each request, in ms. */
  latencyMs: number;
  /** 0 – 0.5. Probability that a data/mutation request fails before being sent. */
  failureRate: number;
  /** Seed for the failure sequence, so runs are reproducible. */
  failureSeed: number;
  /** One-shot: the next mutation reaches the server, but its response is discarded. */
  dropNextMutationResponse: boolean;
}

export const DEFAULT_SIMULATOR: SimulatorConfig = {
  disconnected: false,
  latencyPreset: 'normal',
  latencyMs: 0,
  failureRate: 0,
  failureSeed: 42,
  dropNextMutationResponse: false,
};

export type NetworkErrorKind =
  | 'browser-offline'
  | 'simulated-disconnect'
  | 'simulated-failure'
  | 'response-lost'
  | 'timeout'
  | 'network';

/** The request never produced a usable HTTP response. Always retryable. */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';
  constructor(
    readonly kind: NetworkErrorKind,
    message: string,
  ) {
    super(message);
  }

  get simulated(): boolean {
    return this.kind.startsWith('simulated') || this.kind === 'response-lost';
  }
}

/** The server answered with a non-2xx status. */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type RequestKind = 'health' | 'data' | 'mutation';

export interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  kind?: RequestKind;
  timeoutMs?: number;
}

export interface TransportResponse<T> {
  data: T;
  status: number;
  durationMs: number;
  replayed: boolean;
}

export interface RequestLogEntry {
  id: number;
  at: string;
  method: string;
  path: string;
  kind: RequestKind;
  /** HTTP status, or the network error kind. */
  outcome: string;
  ok: boolean;
  /** Measured wall-clock duration including any injected latency. */
  durationMs: number;
  injectedLatencyMs: number;
  replayed: boolean;
}

export interface TransportOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getConfig: () => SimulatorConfig;
  getSessionId: () => string | undefined;
  /** Called after a one-shot "drop next response" has been used. */
  onDropConsumed?: () => void;
  /** Called after every request so connectivity can learn from real outcomes. */
  onOutcome?: (entry: RequestLogEntry, error?: unknown) => void;
  isBrowserOnline?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Transport {
  private rng: () => number;
  private rngSeed: number;
  private nextLogId = 1;
  /** Replaced (not mutated) on every request so it works as a useSyncExternalStore snapshot. */
  private log: readonly RequestLogEntry[] = [];
  private readonly logListeners = new Set<() => void>();

  constructor(private readonly options: TransportOptions) {
    this.rngSeed = options.getConfig().failureSeed;
    this.rng = createRng(this.rngSeed);
  }

  get requestLog(): readonly RequestLogEntry[] {
    return this.log;
  }

  subscribeLog(listener: () => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  /** Restarts the deterministic failure sequence (used by tests and on seed change). */
  reseed(seed: number): void {
    this.rngSeed = seed;
    this.rng = createRng(seed);
  }

  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<TransportResponse<T>> {
    const kind = options.kind ?? (method === 'GET' ? 'data' : 'mutation');
    const config = this.options.getConfig();
    if (config.failureSeed !== this.rngSeed) this.reseed(config.failureSeed);
    const now = this.options.now ?? (() => performance.now());
    const started = now();
    const injectedLatencyMs = config.latencyMs;

    const finish = (outcome: string, ok: boolean, replayed: boolean, error?: unknown) => {
      const entry: RequestLogEntry = {
        id: this.nextLogId++,
        at: new Date().toISOString(),
        method,
        path,
        kind,
        outcome,
        ok,
        durationMs: Math.round(now() - started),
        injectedLatencyMs,
        replayed,
      };
      this.log = [entry, ...this.log].slice(0, 60);
      for (const listener of this.logListeners) listener();
      this.options.onOutcome?.(entry, error);
      return entry;
    };

    const fail = (error: NetworkError): never => {
      finish(error.kind, false, false, error);
      throw error;
    };

    if (this.options.isBrowserOnline && !this.options.isBrowserOnline()) {
      fail(new NetworkError('browser-offline', 'Browser reports no network connection'));
    }
    if (config.disconnected) {
      fail(new NetworkError('simulated-disconnect', 'Simulated API disconnection is active'));
    }
    if (injectedLatencyMs > 0) await (this.options.sleep ?? defaultSleep)(injectedLatencyMs);
    // Re-read: the user may have pressed DISCONNECT while we were "in flight".
    if (this.options.getConfig().disconnected) {
      fail(new NetworkError('simulated-disconnect', 'Simulated API disconnection is active'));
    }
    // Health probes are exempt from random failures so the status badge stays meaningful.
    if (kind !== 'health' && config.failureRate > 0 && this.rng() < config.failureRate) {
      fail(
        new NetworkError(
          'simulated-failure',
          `Simulated request failure (${Math.round(config.failureRate * 100)}% rate)`,
        ),
      );
    }

    const dropResponse = kind === 'mutation' && this.options.getConfig().dropNextMutationResponse;
    if (dropResponse) this.options.onDropConsumed?.();

    const headers: Record<string, string> = { accept: 'application/json' };
    const sessionId = this.options.getSessionId();
    if (sessionId) headers[SESSION_HEADER] = sessionId;
    if (options.idempotencyKey) headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl ?? ''}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      clearTimeout(timeout);
      return fail(
        controller.signal.aborted
          ? new NetworkError('timeout', `Request timed out after ${options.timeoutMs ?? 10_000} ms`)
          : new NetworkError('network', 'Network request failed — backend unreachable'),
      );
    }
    clearTimeout(timeout);

    const replayed = response.headers.get(REPLAY_HEADER) === 'true';
    const text = await response.text().catch(() => '');

    if (dropResponse) {
      // The server has processed the request; the client pretends it never heard back.
      return fail(
        new NetworkError(
          'response-lost',
          'Response dropped after the server processed the mutation',
        ),
      );
    }

    const parsed = text ? safeJson(text) : undefined;
    if (!response.ok) {
      const body = parsed as ApiErrorBody | undefined;
      const error = new HttpError(
        response.status,
        body?.error?.code ?? 'UNKNOWN',
        body?.error?.message ?? `HTTP ${response.status}`,
        body?.error?.details,
      );
      finish(String(response.status), false, replayed, error);
      throw error;
    }
    const entry = finish(String(response.status), true, replayed);
    return { data: parsed as T, status: response.status, durationMs: entry.durationMs, replayed };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
