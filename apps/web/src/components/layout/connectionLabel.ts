import type { ConnectionState, OfflineReason } from '../../services/connectivity/connectionState';

export function connectionLabel(state: ConnectionState, reason: OfflineReason): string {
  switch (state) {
    case 'CONNECTED':
      return 'System online';
    case 'SYNCHRONIZING':
      return 'Synchronizing';
    case 'DEGRADED':
      return 'Degraded';
    case 'SYNC_ERROR':
      return 'Sync error';
    case 'CHECKING':
      return 'Checking';
    case 'OFFLINE':
      return reason === 'simulated'
        ? 'Offline · simulated'
        : reason === 'browser'
          ? 'Offline · browser'
          : 'Backend unreachable';
  }
}
