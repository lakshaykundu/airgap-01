import { deriveConnection, type DerivedConnection } from '../services/connectivity/connectionState';
import { useAppSelector } from '../store';

export function useConnection(): DerivedConnection & {
  simulated: boolean;
  browserOnline: boolean;
} {
  const monitor = useAppSelector((state) => state.connectivity.monitor);
  const sync = useAppSelector((state) => state.connectivity.sync);
  const simulated = useAppSelector((state) => state.simulator.disconnected);
  const derived = deriveConnection({
    browserOnline: monitor.browserOnline,
    simulatedDisconnect: simulated,
    backendReachable: monitor.backendReachable,
    checking: monitor.checking,
    degraded: monitor.degraded,
    syncPhase: sync.phase,
    hasSyncError: Boolean(sync.lastError),
  });
  return { ...derived, simulated, browserOnline: monitor.browserOnline };
}
