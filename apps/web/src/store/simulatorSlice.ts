import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_SIMULATOR, type SimulatorConfig } from '../services/api/transport';

export const SIMULATOR_STORAGE_KEY = 'airgap-01:simulator';

export const LATENCY_PRESETS: Record<
  Exclude<SimulatorConfig['latencyPreset'], 'custom'>,
  number
> = {
  normal: 0,
  '3g': 400,
  '2g': 1500,
};

/** The simulated disconnect persists across reloads until restored or reset. */
export function loadSimulatorConfig(): SimulatorConfig {
  try {
    const raw = localStorage.getItem(SIMULATOR_STORAGE_KEY);
    if (!raw) return DEFAULT_SIMULATOR;
    const parsed = JSON.parse(raw) as Partial<SimulatorConfig>;
    return {
      ...DEFAULT_SIMULATOR,
      ...parsed,
      failureRate: Math.min(0.5, Math.max(0, Number(parsed.failureRate ?? 0))),
      // One-shot flags never survive a reload.
      dropNextMutationResponse: false,
    };
  } catch {
    return DEFAULT_SIMULATOR;
  }
}

const simulatorSlice = createSlice({
  name: 'simulator',
  initialState: DEFAULT_SIMULATOR,
  reducers: {
    hydrate: (_state, action: PayloadAction<SimulatorConfig>) => action.payload,
    setDisconnected(state, action: PayloadAction<boolean>) {
      state.disconnected = action.payload;
    },
    setLatencyPreset(state, action: PayloadAction<SimulatorConfig['latencyPreset']>) {
      state.latencyPreset = action.payload;
      if (action.payload !== 'custom') state.latencyMs = LATENCY_PRESETS[action.payload];
    },
    setCustomLatency(state, action: PayloadAction<number>) {
      state.latencyPreset = 'custom';
      state.latencyMs = Math.max(0, Math.min(10_000, Math.round(action.payload)));
    },
    setFailureRate(state, action: PayloadAction<number>) {
      state.failureRate = Math.max(0, Math.min(0.5, action.payload));
    },
    setFailureSeed(state, action: PayloadAction<number>) {
      state.failureSeed = action.payload;
    },
    armDropNextResponse(state) {
      state.dropNextMutationResponse = true;
    },
    consumeDropNextResponse(state) {
      state.dropNextMutationResponse = false;
    },
    resetSimulator: () => DEFAULT_SIMULATOR,
  },
});

export const simulatorActions = simulatorSlice.actions;
export default simulatorSlice.reducer;
