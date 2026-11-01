import { HttpError, NetworkError } from '../api/transport';

export interface RetryPolicy {
  baseDelayMs: number;
  maxDelayMs: number;
  /** ± fraction of the delay that is randomised, to avoid synchronized retry storms. */
  jitterRatio: number;
  /** After this many failed attempts the mutation is parked as `failed` for the user to retry. */
  maxAutoRetries: number;
}

export const RETRY_POLICY: RetryPolicy = {
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
  maxAutoRetries: 8,
};

/**
 * Exponential backoff with bounded jitter: 1s, 2s, 4s, 8s, 16s, then capped
 * at 30s. `attempt` is 1-based (the delay before the first retry).
 */
export function computeRetryDelay(
  attempt: number,
  random: () => number = Math.random,
  policy: RetryPolicy = RETRY_POLICY,
): number {
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = exponential * policy.jitterRatio * (random() * 2 - 1);
  return Math.round(
    Math.min(policy.maxDelayMs, Math.max(policy.baseDelayMs / 2, exponential + jitter)),
  );
}

export type ErrorClass = 'retryable' | 'conflict' | 'permanent' | 'session-expired';

/**
 * Decides what the sync engine does with a failed request:
 * - network problems, timeouts, 408/429/5xx → retry with backoff
 * - 409 version conflict / 410 deleted       → stop and ask the user
 * - 401 unknown session                      → recreate the demo session
 * - other 4xx (validation etc.)              → permanent failure, no auto-retry
 */
export function classifyError(error: unknown): ErrorClass {
  if (error instanceof NetworkError) return 'retryable';
  if (error instanceof HttpError) {
    if (error.code === 'VERSION_CONFLICT' || error.code === 'INCIDENT_DELETED') return 'conflict';
    if (error.code === 'SESSION_NOT_FOUND' || error.code === 'SESSION_REQUIRED')
      return 'session-expired';
    if (
      error.status === 408 ||
      error.status === 425 ||
      error.status === 429 ||
      error.status >= 500
    ) {
      return 'retryable';
    }
    return 'permanent';
  }
  return 'permanent';
}
