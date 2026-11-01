import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { RuntimeContext } from '../app/RuntimeContext';
import { Runtime } from '../app/runtime';
import { TooltipProvider } from '../components/ui/Tooltip';
import { AirgapDatabase } from '../database/db';
import { createStore } from '../store';

/** Renders with a real (un-booted) Runtime backed by a fresh fake-indexeddb database. */
export function renderWithRuntime(ui: ReactElement) {
  const store = createStore();
  const db = new AirgapDatabase(`rtl-${crypto.randomUUID()}`);
  const runtime = new Runtime(store, db);
  const utils = render(
    <Provider store={store}>
      <RuntimeContext.Provider value={runtime}>
        <TooltipProvider>{ui}</TooltipProvider>
      </RuntimeContext.Provider>
    </Provider>,
  );
  return { ...utils, store, db, runtime };
}
