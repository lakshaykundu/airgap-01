import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ChallengeStep = 'disconnect' | 'create' | 'persist' | 'reconnect' | 'complete';

export interface CheckResult {
  ok: boolean;
  detail: string;
}

export interface ChallengeState {
  active: boolean;
  step: ChallengeStep;
  incidentId: string | null;
  /** Set right before the deliberate reload so the next boot can verify persistence. */
  reloadPending: boolean;
  results: {
    disconnected: CheckResult | null;
    preserved: CheckResult | null;
    reload: CheckResult | null;
    synced: CheckResult | null;
  };
  startedAt: string | null;
}

export const CHALLENGE_STORAGE_KEY = 'airgap-01:challenge';

export const EMPTY_CHALLENGE: ChallengeState = {
  active: false,
  step: 'disconnect',
  incidentId: null,
  reloadPending: false,
  results: { disconnected: null, preserved: null, reload: null, synced: null },
  startedAt: null,
};

export function loadChallenge(): ChallengeState {
  try {
    const raw = localStorage.getItem(CHALLENGE_STORAGE_KEY);
    return raw ? { ...EMPTY_CHALLENGE, ...(JSON.parse(raw) as ChallengeState) } : EMPTY_CHALLENGE;
  } catch {
    return EMPTY_CHALLENGE;
  }
}

const challengeSlice = createSlice({
  name: 'challenge',
  initialState: EMPTY_CHALLENGE,
  reducers: {
    hydrate: (_state, action: PayloadAction<ChallengeState>) => action.payload,
    start: () => ({ ...EMPTY_CHALLENGE, active: true, startedAt: new Date().toISOString() }),
    exit: () => EMPTY_CHALLENGE,
    goTo(state, action: PayloadAction<ChallengeStep>) {
      state.step = action.payload;
    },
    recordDisconnected(state, action: PayloadAction<CheckResult>) {
      state.results.disconnected = action.payload;
      if (action.payload.ok) state.step = 'create';
    },
    recordCreated(state, action: PayloadAction<{ incidentId: string; result: CheckResult }>) {
      state.incidentId = action.payload.incidentId;
      state.results.preserved = action.payload.result;
    },
    advanceToPersist(state) {
      state.step = 'persist';
    },
    markReloadPending(state) {
      state.reloadPending = true;
    },
    recordReload(state, action: PayloadAction<CheckResult>) {
      state.reloadPending = false;
      state.results.reload = action.payload;
      if (action.payload.ok) state.step = 'reconnect';
    },
    recordSynced(state, action: PayloadAction<CheckResult>) {
      state.results.synced = action.payload;
      if (action.payload.ok) state.step = 'complete';
    },
  },
});

export const challengeActions = challengeSlice.actions;
export default challengeSlice.reducer;
