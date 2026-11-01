import { useSyncExternalStore } from 'react';
import type { BootStepId, BootStepStatus } from './runtime';

export interface BootStepState {
  id: BootStepId;
  label: string;
  status: BootStepStatus;
  detail?: string;
}

export interface BootState {
  phase: 'booting' | 'ready' | 'failed';
  steps: BootStepState[];
  error?: string;
}

const INITIAL: BootState = {
  phase: 'booting',
  steps: [
    { id: 'storage', label: 'Establishing local storage', status: 'pending' },
    { id: 'offline', label: 'Preparing offline systems', status: 'pending' },
    { id: 'data', label: 'Loading operational data', status: 'pending' },
  ],
};

let state: BootState = INITIAL;
const listeners = new Set<() => void>();

function set(next: BootState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Tiny external store so boot progress is reported from real initialization steps. */
export const bootStore = {
  get: () => state,
  reset: () => set(INITIAL),
  report(id: BootStepId, status: BootStepStatus, detail?: string) {
    set({
      ...state,
      steps: state.steps.map((step) => (step.id === id ? { ...step, status, detail } : step)),
    });
  },
  ready: () => set({ ...state, phase: 'ready' }),
  fail: (error: string) => set({ ...state, phase: 'failed', error }),
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useBootState(): BootState {
  return useSyncExternalStore(bootStore.subscribe, bootStore.get, bootStore.get);
}
