import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import challenge, { CHALLENGE_STORAGE_KEY, loadChallenge } from './challengeSlice';
import connectivity from './connectivitySlice';
import filters from './filtersSlice';
import perf from './perfSlice';
import simulator, { SIMULATOR_STORAGE_KEY, loadSimulatorConfig } from './simulatorSlice';
import ui from './uiSlice';

export function createStore() {
  const store = configureStore({
    reducer: { ui, filters, simulator, connectivity, challenge, perf },
    preloadedState: {
      simulator: loadSimulatorConfig(),
      challenge: loadChallenge(),
    },
  });

  // Persist the slices that must survive reloads.
  let lastSimulator = store.getState().simulator;
  let lastChallenge = store.getState().challenge;
  store.subscribe(() => {
    const { simulator: sim, challenge: ch } = store.getState();
    try {
      if (sim !== lastSimulator) {
        lastSimulator = sim;
        localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(sim));
      }
      if (ch !== lastChallenge) {
        lastChallenge = ch;
        localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(ch));
      }
    } catch {
      /* storage unavailable */
    }
  });
  return store;
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
