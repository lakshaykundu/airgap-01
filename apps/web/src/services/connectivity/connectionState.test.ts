import { describe, expect, it } from 'vitest';
import { deriveConnection, type ConnectivityInputs } from './connectionState';

const base: ConnectivityInputs = {
  browserOnline: true,
  simulatedDisconnect: false,
  backendReachable: true,
  checking: false,
  degraded: false,
  syncPhase: 'idle',
  hasSyncError: false,
};

describe('deriveConnection', () => {
  it('is CONNECTED only when the backend actually answered', () => {
    expect(deriveConnection(base)).toEqual({
      state: 'CONNECTED',
      offlineReason: null,
      canReachBackend: true,
    });
    expect(deriveConnection({ ...base, backendReachable: null }).state).toBe('CHECKING');
    expect(deriveConnection({ ...base, backendReachable: false })).toMatchObject({
      state: 'OFFLINE',
      offlineReason: 'backend-unreachable',
    });
  });

  it('distinguishes a real browser outage from a simulated one', () => {
    expect(
      deriveConnection({ ...base, browserOnline: false, simulatedDisconnect: true }).offlineReason,
    ).toBe('browser');
    expect(deriveConnection({ ...base, simulatedDisconnect: true }).offlineReason).toBe(
      'simulated',
    );
  });

  it('reports sync activity, errors and degradation while reachable', () => {
    expect(deriveConnection({ ...base, syncPhase: 'running' }).state).toBe('SYNCHRONIZING');
    expect(deriveConnection({ ...base, hasSyncError: true }).state).toBe('SYNC_ERROR');
    expect(deriveConnection({ ...base, degraded: true }).state).toBe('DEGRADED');
  });
});
