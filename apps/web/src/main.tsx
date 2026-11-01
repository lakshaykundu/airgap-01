import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './app/App';
import { Runtime } from './app/runtime';
import { registerServiceWorker } from './app/serviceWorker';
import { createStore } from './store';
import './styles/index.css';

const store = createStore();
// One runtime per tab, created outside React so StrictMode can't double-boot it.
const runtime = new Runtime(store);
registerServiceWorker(store);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App runtime={runtime} />
    </Provider>
  </StrictMode>,
);
