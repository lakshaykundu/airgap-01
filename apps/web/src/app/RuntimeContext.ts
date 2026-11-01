import { createContext, useContext } from 'react';
import type { Runtime } from './runtime';

export const RuntimeContext = createContext<Runtime | null>(null);

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime must be used inside <RuntimeContext.Provider>');
  return runtime;
}
