import { Command, FlaskConical, Info, Menu, PlugZap, Unplug } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useRuntime } from '../../app/RuntimeContext';
import { useLastSyncAt, usePendingCount } from '../../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { formatTime } from '../../utils/format';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/States';
import { Tooltip } from '../ui/Tooltip';
import { ConnectivityBadge } from './ConnectivityBadge';
import { Logo } from './Logo';
import { sectionFor } from './nav';

export function QueueCounter() {
  const pending = usePendingCount();
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      data-testid="queue-counter"
      data-tour="queue-counter"
      data-count={pending}
      onClick={() => dispatch(uiActions.setQueueDrawer(true))}
      className={cn(
        'flex h-8 items-center gap-2 rounded-lg border px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors',
        pending > 0
          ? 'border-accent/50 bg-accent/10 text-[#c3b5ff] hover:bg-accent/15'
          : 'border-line text-fg-2 hover:bg-hover hover:text-fg',
      )}
      aria-label={`Pending sync queue: ${pending} mutation${pending === 1 ? '' : 's'}. Open queue.`}
    >
      <span className="hidden sm:inline">Queue</span>
      <AnimatedNumber value={pending} pad={2} className="font-semibold" />
    </button>
  );
}

export function NetworkToggle({ className }: { className?: string }) {
  const runtime = useRuntime();
  const disconnected = useAppSelector((state) => state.simulator.disconnected);
  return (
    <Button
      size="sm"
      mono
      data-tour="network-toggle"
      data-testid="network-toggle"
      variant={disconnected ? 'primary' : 'outline'}
      onClick={() => void runtime.setSimulatedDisconnect(!disconnected)}
      className={className}
      aria-pressed={disconnected}
    >
      {disconnected ? <PlugZap className="h-3.5 w-3.5" /> : <Unplug className="h-3.5 w-3.5" />}
      <span className="hidden lg:inline">
        {disconnected ? 'Restore connection' : 'Disconnect network'}
      </span>
      <span className="sr-only lg:hidden">
        {disconnected ? 'Restore connection' : 'Disconnect network'}
      </span>
    </Button>
  );
}

export function TopBar() {
  const location = useLocation();
  const section = sectionFor(location.pathname);
  const lastSyncAt = useLastSyncAt();
  const dispatch = useAppDispatch();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line/70 bg-bg/80 px-3 backdrop-blur-xl sm:px-4">
      <button
        type="button"
        className="rounded-lg p-2 text-fg-2 hover:bg-hover hover:text-fg lg:hidden"
        onClick={() => dispatch(uiActions.setMobileNav(true))}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link to="/" className="shrink-0 rounded-lg" aria-label="AIRGAP/01 home">
        <span className="hidden sm:block">
          <Logo />
        </span>
        <span className="sm:hidden">
          <Logo compact />
        </span>
      </Link>

      <div className="mx-2 hidden h-5 w-px bg-line xl:block" aria-hidden />
      <p
        className="hidden min-w-0 truncate font-mono text-[11px] tracking-[0.16em] text-fg-2 uppercase xl:block"
        aria-live="off"
      >
        <span className="text-fg-3">Console / </span>
        {section.section}
      </p>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ConnectivityBadge />
        <Tooltip content="Last successful synchronization with the backend">
          <span
            className="hidden h-8 items-center gap-1.5 rounded-lg border border-line/70 px-2.5 font-mono text-[11px] tracking-[0.1em] text-fg-2 xl:flex"
            data-testid="last-sync"
          >
            <span className="text-fg-3">LAST SYNC</span>
            <span className="tabular-nums">{formatTime(lastSyncAt)}</span>
          </span>
        </Tooltip>
        <QueueCounter />
        <NetworkToggle className="hidden md:inline-flex" />
        <Link
          to="/lab"
          data-tour="playground-link"
          className="hidden h-8 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 font-mono text-[11px] tracking-[0.1em] text-[#c3b5ff] uppercase transition-colors hover:bg-accent/20 lg:inline-flex"
        >
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden 2xl:inline">Engineering playground</span>
          <span className="2xl:hidden">Chaos Lab</span>
        </Link>
        <Tooltip content="Command palette">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(uiActions.setCommandPalette(true))}
            aria-label="Open command palette"
            className="hidden sm:inline-flex"
          >
            <Command className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content="About AIRGAP/01">
          <Link
            to="/about"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-fg-2 hover:bg-hover hover:text-fg sm:inline-flex"
            aria-label="About this project"
          >
            <Info className="h-4 w-4" />
          </Link>
        </Tooltip>
      </div>
      <span className="sr-only">
        Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> to open the command palette.
      </span>
    </header>
  );
}
