import { AnimatePresence, motion } from 'motion/react';
import { useConnection } from '../../hooks/useConnection';
import type { ConnectionState } from '../../services/connectivity/connectionState';
import { connectionLabel } from './connectionLabel';
import { useAppSelector } from '../../store';
import { cn } from '../../utils/cn';
import { StatusDot } from '../ui/StatusDot';
import { Tooltip } from '../ui/Tooltip';

const TONE: Record<
  ConnectionState,
  { dot: 'success' | 'warning' | 'danger' | 'primary' | 'muted'; className: string }
> = {
  CONNECTED: { dot: 'success', className: 'border-success/35 text-success bg-success/[0.06]' },
  SYNCHRONIZING: { dot: 'primary', className: 'border-primary/40 text-primary bg-primary/[0.07]' },
  DEGRADED: { dot: 'warning', className: 'border-warning/40 text-warning bg-warning/[0.06]' },
  SYNC_ERROR: { dot: 'danger', className: 'border-danger/45 text-danger bg-danger/[0.06]' },
  CHECKING: { dot: 'muted', className: 'border-line text-fg-2 bg-elevated' },
  OFFLINE: { dot: 'danger', className: 'border-danger/45 text-danger bg-danger/[0.07]' },
};

export function ConnectivityBadge({ compact = false }: { compact?: boolean }) {
  const connection = useConnection();
  const monitor = useAppSelector((state) => state.connectivity.monitor);
  const realtime = useAppSelector((state) => state.connectivity.realtime);
  const tone = TONE[connection.state];
  const label = connectionLabel(connection.state, connection.offlineReason);

  return (
    <Tooltip
      content={
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
          <dt className="text-fg-3">Browser</dt>
          <dd>{connection.browserOnline ? 'online (navigator.onLine)' : 'offline'}</dd>
          <dt className="text-fg-3">Simulated</dt>
          <dd>{connection.simulated ? 'API disconnected (Chaos Lab)' : 'off'}</dd>
          <dt className="text-fg-3">Backend</dt>
          <dd>
            {monitor.backendReachable === null
              ? 'not probed yet'
              : monitor.backendReachable
                ? `reachable · ${monitor.lastLatencyMs ?? '—'} ms`
                : 'unreachable'}
          </dd>
          <dt className="text-fg-3">Realtime</dt>
          <dd>
            {realtime === 'live'
              ? 'SSE stream live'
              : realtime === 'polling'
                ? 'polling every 5 s'
                : realtime}
          </dd>
        </dl>
      }
    >
      <button
        type="button"
        data-testid="connection-badge"
        data-state={connection.state}
        data-reason={connection.offlineReason ?? ''}
        className={cn(
          'flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors',
          tone.className,
        )}
        aria-label={`Connection: ${label}`}
      >
        <StatusDot
          tone={tone.dot}
          pulse={
            connection.state === 'SYNCHRONIZING' ||
            connection.state === 'CHECKING' ||
            connection.state === 'OFFLINE'
          }
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(compact && 'sr-only')}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}
