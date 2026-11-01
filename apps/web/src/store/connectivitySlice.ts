import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RealtimeMode } from '../services/api/realtime';
import type { ConnectivitySnapshot } from '../services/connectivity/ConnectivityMonitor';
import type { SyncEngineState } from '../services/sync/SyncEngine';

export interface ConnectivityState {
  monitor: ConnectivitySnapshot;
  sync: SyncEngineState;
  realtime: RealtimeMode;
  serviceWorker:
    'unsupported' | 'registering' | 'active' | 'update-available' | 'error' | 'dev-disabled';
  lockMechanism: string;
}

const initialState: ConnectivityState = {
  monitor: {
    browserOnline: true,
    backendReachable: null,
    checking: false,
    lastCheckAt: null,
    lastLatencyMs: null,
    degraded: false,
    lastFailure: null,
    realtimeTransport: null,
  },
  sync: {
    phase: 'idle',
    activeMutationId: null,
    lastRunStartedAt: null,
    lastSuccessAt: null,
    lastDurationMs: null,
    lastError: null,
    nextRetryAt: null,
    lockedByOtherTab: false,
    lastRun: null,
  },
  realtime: 'off',
  serviceWorker: 'registering',
  lockMechanism: 'web-locks',
};

const connectivitySlice = createSlice({
  name: 'connectivity',
  initialState,
  reducers: {
    monitorUpdated(state, action: PayloadAction<ConnectivitySnapshot>) {
      state.monitor = action.payload;
    },
    syncUpdated(state, action: PayloadAction<SyncEngineState>) {
      state.sync = action.payload;
    },
    realtimeUpdated(state, action: PayloadAction<RealtimeMode>) {
      state.realtime = action.payload;
    },
    serviceWorkerUpdated(state, action: PayloadAction<ConnectivityState['serviceWorker']>) {
      state.serviceWorker = action.payload;
    },
    lockMechanismDetected(state, action: PayloadAction<string>) {
      state.lockMechanism = action.payload;
    },
  },
});

export const connectivityActions = connectivitySlice.actions;
export default connectivitySlice.reducer;
