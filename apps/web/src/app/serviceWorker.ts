import type { AppStore } from '../store';
import { connectivityActions } from '../store/connectivitySlice';
import { uiActions } from '../store/uiSlice';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export function applyServiceWorkerUpdate(): void {
  void applyUpdate?.(true);
}

/**
 * Registers the Workbox service worker (production builds only). It precaches
 * the app shell — HTML, JS, CSS, fonts, icons — so the console loads with no
 * network. It never caches API responses; data lives in IndexedDB.
 */
export function registerServiceWorker(store: AppStore): void {
  if (!('serviceWorker' in navigator)) {
    store.dispatch(connectivityActions.serviceWorkerUpdated('unsupported'));
    return;
  }
  if (import.meta.env.DEV) {
    store.dispatch(connectivityActions.serviceWorkerUpdated('dev-disabled'));
    return;
  }
  void import('virtual:pwa-register').then(({ registerSW }) => {
    applyUpdate = registerSW({
      immediate: true,
      onRegisteredSW() {
        void navigator.serviceWorker.ready.then(() =>
          store.dispatch(connectivityActions.serviceWorkerUpdated('active')),
        );
      },
      onOfflineReady() {
        store.dispatch(connectivityActions.serviceWorkerUpdated('active'));
        store.dispatch(
          uiActions.pushToast({
            tone: 'success',
            title: 'Offline ready',
            description: 'App shell cached — the console now loads without a network.',
          }),
        );
      },
      onNeedRefresh() {
        store.dispatch(connectivityActions.serviceWorkerUpdated('update-available'));
      },
      onRegisterError() {
        store.dispatch(connectivityActions.serviceWorkerUpdated('error'));
      },
    });
  });
}
