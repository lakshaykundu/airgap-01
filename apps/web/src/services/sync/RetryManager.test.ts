import { describe, expect, it } from 'vitest';
import { HttpError, NetworkError } from '../api/transport';
import { RETRY_POLICY, classifyError, computeRetryDelay } from './RetryManager';

describe('computeRetryDelay', () => {
  const noJitter = () => 0.5; // random() = 0.5 → jitter term is exactly zero

  it('doubles from 1s and caps at 30s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => computeRetryDelay(n, noJitter))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });

  it('keeps jitter within ±20% and never exceeds the cap', () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const base = Math.min(RETRY_POLICY.maxDelayMs, 1000 * 2 ** (attempt - 1));
      const low = computeRetryDelay(attempt, () => 0);
      const high = computeRetryDelay(attempt, () => 0.999999);
      expect(low).toBeGreaterThanOrEqual(Math.round(base * 0.8) - 1);
      expect(high).toBeLessThanOrEqual(Math.min(RETRY_POLICY.maxDelayMs, Math.round(base * 1.2)));
    }
  });

  it('never returns a tight-loop delay', () => {
    expect(computeRetryDelay(0, () => 0)).toBeGreaterThanOrEqual(500);
  });
});

describe('classifyError', () => {
  it('retries network-level failures, including lost responses', () => {
    expect(classifyError(new NetworkError('network', 'x'))).toBe('retryable');
    expect(classifyError(new NetworkError('response-lost', 'x'))).toBe('retryable');
    expect(classifyError(new NetworkError('simulated-failure', 'x'))).toBe('retryable');
  });

  it('retries 408/429/5xx but not validation errors', () => {
    expect(classifyError(new HttpError(503, 'INTERNAL', 'x'))).toBe('retryable');
    expect(classifyError(new HttpError(429, 'RATE_LIMITED', 'x'))).toBe('retryable');
    expect(classifyError(new HttpError(400, 'VALIDATION_FAILED', 'x'))).toBe('permanent');
    expect(classifyError(new HttpError(404, 'NOT_FOUND', 'x'))).toBe('permanent');
  });

  it('routes version conflicts and expired sessions to their own handling', () => {
    expect(classifyError(new HttpError(409, 'VERSION_CONFLICT', 'x'))).toBe('conflict');
    expect(classifyError(new HttpError(410, 'INCIDENT_DELETED', 'x'))).toBe('conflict');
    expect(classifyError(new HttpError(401, 'SESSION_NOT_FOUND', 'x'))).toBe('session-expired');
  });
});
