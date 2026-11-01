import type { SyncPhase } from '../sync/SyncEngine';

export type ConnectionState =
  'CONNECTED' | 'OFFLINE' | 'CHECKING' | 'DEGRADED' | 'SYNCHRONIZING' | 'SYNC_ERROR';

/** Why the app considers itself offline — shown to the user, never conflated. */
export type OfflineReason = 'browser' | 'simulated' | 'backend-unreachable' | null;

export interface ConnectivityInputs {
  browserOnline: boolean;
  simulatedDisconnect: boolean;
  /** null = not yet probed. */
  backendReachable: boolean | null;
  checking: boolean;
  degraded: boolean;
  syncPhase: SyncPhase;
  hasSyncError: boolean;
}

export interface DerivedConnection {
  state: ConnectionState;
  offlineReason: OfflineReason;
  canReachBackend: boolean;
}

/**
 * Single source of truth for the status badge. Order matters: a real browser
 * outage outranks a simulated one, which outranks backend reachability.
 * `navigator.onLine === true` alone never yields CONNECTED — the backend must
 * have actually answered.
 */
export function deriveConnection(input: ConnectivityInputs): DerivedConnection {
  if (!input.browserOnline)
    return { state: 'OFFLINE', offlineReason: 'browser', canReachBackend: false };
  if (input.simulatedDisconnect)
    return { state: 'OFFLINE', offlineReason: 'simulated', canReachBackend: false };
  if (input.backendReachable === null)
    return { state: 'CHECKING', offlineReason: null, canReachBackend: false };
  if (!input.backendReachable) {
    return {
      state: input.checking ? 'CHECKING' : 'OFFLINE',
      offlineReason: 'backend-unreachable',
      canReachBackend: false,
    };
  }
  if (input.syncPhase === 'running')
    return { state: 'SYNCHRONIZING', offlineReason: null, canReachBackend: true };
  if (input.hasSyncError)
    return { state: 'SYNC_ERROR', offlineReason: null, canReachBackend: true };
  if (input.degraded) return { state: 'DEGRADED', offlineReason: null, canReachBackend: true };
  return { state: 'CONNECTED', offlineReason: null, canReachBackend: true };
}
