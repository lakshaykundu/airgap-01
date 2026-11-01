import Dexie from 'dexie';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from '../components/layout/AppShell';
import { BootScreen, StorageFailure } from '../components/layout/BootScreen';
import { TooltipProvider } from '../components/ui/Tooltip';
import { Skeleton } from '../components/ui/States';
import { IncidentsPage } from '../pages/IncidentsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { bootStore, useBootState } from './bootStore';
import { RuntimeContext } from './RuntimeContext';
import type { Runtime } from './runtime';

// Secondary panels are code-split; the service worker precaches every chunk,
// so they still load offline.
const MapPage = lazy(() => import('../pages/MapPage'));
const ActivityPage = lazy(() => import('../pages/ActivityPage'));
const SyncCenterPage = lazy(() => import('../pages/SyncCenterPage'));
const ChaosLabPage = lazy(() => import('../pages/ChaosLabPage'));
const ArchitecturePage = lazy(() => import('../pages/ArchitecturePage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

let bootPromise: Promise<void> | null = null;

function PageFallback() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading section">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function App({ runtime }: { runtime: Runtime }) {
  const boot = useBootState();
  const [overlay, setOverlay] = useState(true);

  useEffect(() => {
    bootPromise ??= runtime
      .boot(bootStore.report)
      .then(() => bootStore.ready())
      .catch((error: unknown) =>
        bootStore.fail(error instanceof Error ? error.message : String(error)),
      );
  }, [runtime]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    // Leave "SYSTEM READY" on screen just long enough to read; no artificial delay before that.
    const id = setTimeout(() => setOverlay(false), 450);
    return () => clearTimeout(id);
  }, [boot.phase]);

  if (boot.phase === 'failed') {
    return (
      <StorageFailure
        error={boot.error}
        onRetry={() => window.location.reload()}
        onReset={() => {
          runtime.db.close();
          void Dexie.delete(runtime.db.name).finally(() => window.location.reload());
        }}
      />
    );
  }

  return (
    <RuntimeContext.Provider value={runtime}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <BootScreen state={boot} visible={overlay} />
          {boot.phase === 'ready' && (
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="incidents" element={<IncidentsPage />} />
                  <Route
                    path="map"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <MapPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="activity"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <ActivityPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="sync"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <SyncCenterPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="lab"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <ChaosLabPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="architecture"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <ArchitecturePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="about"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <AboutPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <Suspense fallback={<PageFallback />}>
                        <NotFoundPage />
                      </Suspense>
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          )}
        </TooltipProvider>
      </MotionConfig>
    </RuntimeContext.Provider>
  );
}
