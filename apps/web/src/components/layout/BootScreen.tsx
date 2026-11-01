import { CircleCheck, CircleDashed, LoaderCircle, OctagonAlert, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { BootState } from '../../app/bootStore';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { LogoMark } from './Logo';

const ICONS = {
  pending: <CircleDashed className="h-3.5 w-3.5 text-fg-3" />,
  active: (
    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary motion-reduce:animate-none" />
  ),
  done: <CircleCheck className="h-3.5 w-3.5 text-success" />,
  warning: <TriangleAlert className="h-3.5 w-3.5 text-warning" />,
  error: <OctagonAlert className="h-3.5 w-3.5 text-danger" />,
};

/** Shows the REAL initialization steps; it disappears as soon as they complete. */
export function BootScreen({ state, visible }: { state: BootState; visible: boolean }) {
  const allDone = state.phase === 'ready';
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="boot"
          role="status"
          aria-live="polite"
          aria-label="Initializing operations console"
          className="fixed inset-0 z-[100] grid place-items-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
          <div className="relative w-[min(440px,calc(100vw-32px))]">
            <div className="flex items-center gap-3">
              <LogoMark className="h-9 w-9" />
              <div>
                <p className="font-mono text-lg font-semibold tracking-[0.18em]">
                  AIRGAP<span className="text-primary">/</span>01
                </p>
                <p className="label-xs">Initializing operations console</p>
              </div>
            </div>
            <ol className="mt-8 space-y-3 font-mono text-[12px]">
              {state.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3">
                  <span className="mt-0.5">{ICONS[step.status]}</span>
                  <div className="min-w-0">
                    <p className={cn(step.status === 'pending' ? 'text-fg-3' : 'text-fg')}>
                      {step.label}...
                    </p>
                    {step.detail && <p className="mt-0.5 text-[11px] text-fg-3">{step.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 h-px w-full overflow-hidden bg-line">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-accent"
                initial={{ width: '0%' }}
                animate={{
                  width: `${(state.steps.filter((s) => s.status !== 'pending' && s.status !== 'active').length / state.steps.length) * 100}%`,
                }}
                transition={{ duration: 0.25 }}
              />
            </div>
            <p
              className={cn(
                'mt-4 font-mono text-xs tracking-[0.2em] transition-opacity',
                allDone ? 'text-primary opacity-100' : 'opacity-0',
              )}
            >
              SYSTEM READY
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StorageFailure({
  error,
  onRetry,
  onReset,
}: {
  error?: string;
  onRetry: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div role="alert" className="panel panel-lit w-full max-w-lg p-6">
        <p className="label-xs text-danger">Initialization failed</p>
        <h1 className="mt-2 text-xl font-semibold">Local storage is unavailable</h1>
        <p className="mt-2 text-sm text-fg-2">
          AIRGAP/01 keeps your incidents and its sync queue in IndexedDB. The browser refused to
          open it, so the console cannot guarantee your work survives a reload.
        </p>
        {error && (
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs text-fg-3">
            {error}
          </pre>
        )}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-fg-2">
          <li>Private/incognito windows may block or limit IndexedDB — try a normal window.</li>
          <li>Make sure site data/cookies are allowed for this site.</li>
          <li>Close other AIRGAP/01 tabs that may hold an older database version open.</li>
          <li>
            If storage is full, free space or reset local data below (unsynced changes will be
            lost).
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" mono onClick={onRetry}>
            Retry
          </Button>
          <Button variant="danger" mono onClick={onReset}>
            Reset local database
          </Button>
        </div>
      </div>
    </div>
  );
}
