import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { ChallengeOverlay } from '../challenge/ChallengeOverlay';
import { CommandPalette } from '../command/CommandPalette';
import { IncidentDetailDrawer } from '../incidents/IncidentDetailDrawer';
import { IncidentEditor } from '../incidents/IncidentEditor';
import { ConflictDialog } from '../sync/ConflictDialog';
import { QueueDrawer } from '../sync/QueueDrawer';
import { Sheet } from '../ui/Sheet';
import { LiveAnnouncer } from './LiveAnnouncer';
import { Sidebar, SidebarNav } from './Sidebar';
import { Toaster } from './Toaster';
import { TopBar } from './TopBar';
import { UpdateBanner } from './UpdateBanner';

const DevConsole = lazy(() => import('../console/DevConsole'));

function MobileNav() {
  const open = useAppSelector((state) => state.ui.mobileNavOpen);
  const dispatch = useAppDispatch();
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => dispatch(uiActions.setMobileNav(value))}
      title="AIRGAP/01"
      eyebrow="Navigation"
      side="left"
      className="sm:w-72"
    >
      <div className="py-3">
        <SidebarNav collapsed={false} onNavigate={() => dispatch(uiActions.setMobileNav(false))} />
      </div>
    </Sheet>
  );
}

export function AppShell() {
  const dispatch = useAppDispatch();
  const devConsoleOpen = useAppSelector((state) => state.ui.devConsoleOpen);
  const location = useLocation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dispatch(uiActions.setCommandPalette(true));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '`') {
        event.preventDefault();
        dispatch(uiActions.toggleDevConsole());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="relative min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[90] rounded-lg bg-primary px-3 py-2 text-sm text-bg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[480px] bg-grid" aria-hidden />
      <div
        className="pointer-events-none fixed -top-40 left-1/2 h-80 w-[900px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl"
        aria-hidden
      />
      <TopBar />
      <UpdateBanner />
      <div className="relative flex">
        <Sidebar />
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none"
          style={{ paddingBottom: devConsoleOpen ? 300 : 0 }}
        >
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <IncidentEditor />
      <IncidentDetailDrawer />
      <ConflictDialog />
      <QueueDrawer />
      <CommandPalette />
      <ChallengeOverlay />
      {devConsoleOpen && (
        <Suspense fallback={null}>
          <DevConsole />
        </Suspense>
      )}
      <LiveAnnouncer />
      <Toaster />
    </div>
  );
}
