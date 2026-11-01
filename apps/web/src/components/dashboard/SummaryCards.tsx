import { AlertOctagon, CloudUpload, Radio, Siren } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { LocalIncident } from '../../database/db';
import { useConnection } from '../../hooks/useConnection';
import { usePendingCount } from '../../hooks/useLiveData';
import { useAppDispatch } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { connectionLabel } from '../layout/connectionLabel';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Skeleton } from '../ui/States';

function Card({
  label,
  icon,
  value,
  footnote,
  tone,
  onClick,
  testId,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  footnote: ReactNode;
  tone: string;
  onClick?: () => void;
  testId: string;
}) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="panel panel-lit group flex flex-col p-4 text-left"
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <p className="label-xs">{label}</p>
        <span
          className={cn(
            'grid h-7 w-7 place-items-center rounded-lg border border-line/80 bg-bg/60',
            tone,
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-fg">{value}</div>
      <p className="mt-1 text-xs text-fg-3">{footnote}</p>
    </Comp>
  );
}

/** All four numbers are derived from live state — IndexedDB and the connectivity monitor. */
export function SummaryCards({ incidents }: { incidents: LocalIncident[] | undefined }) {
  const pending = usePendingCount();
  const connection = useConnection();
  const dispatch = useAppDispatch();
  const stats = useMemo(() => {
    const open = incidents?.filter((i) => i.status !== 'resolved') ?? [];
    return {
      active: open.length,
      critical: open.filter((i) => i.severity === 'critical').length,
      investigating: open.filter((i) => i.status === 'investigating').length,
    };
  }, [incidents]);

  const statusTone =
    connection.state === 'CONNECTED'
      ? 'text-success'
      : connection.state === 'OFFLINE' || connection.state === 'SYNC_ERROR'
        ? 'text-danger'
        : 'text-warning';

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card
        testId="card-active"
        label="Active incidents"
        icon={<Siren className="h-3.5 w-3.5" />}
        tone="text-primary"
        value={
          incidents ? (
            <AnimatedNumber value={stats.active} pad={2} />
          ) : (
            <Skeleton className="h-9 w-16" />
          )
        }
        footnote={`${stats.investigating} under investigation`}
      />
      <Card
        testId="card-critical"
        label="Critical alerts"
        icon={<AlertOctagon className="h-3.5 w-3.5" />}
        tone="text-danger"
        value={
          incidents ? (
            <AnimatedNumber
              value={stats.critical}
              pad={2}
              className={stats.critical > 0 ? 'text-danger' : undefined}
            />
          ) : (
            <Skeleton className="h-9 w-16" />
          )
        }
        footnote="Open incidents marked critical"
      />
      <Card
        testId="card-pending"
        label="Pending sync"
        icon={<CloudUpload className="h-3.5 w-3.5" />}
        tone="text-accent"
        value={
          <AnimatedNumber
            value={pending}
            pad={2}
            className={pending > 0 ? 'text-[#c3b5ff]' : undefined}
          />
        }
        footnote={pending > 0 ? 'Queued in IndexedDB — open queue' : 'Everything acknowledged'}
        onClick={() => dispatch(uiActions.setQueueDrawer(true))}
      />
      <Card
        testId="card-status"
        label="System status"
        icon={<Radio className="h-3.5 w-3.5" />}
        tone={statusTone}
        value={
          <span className={cn('text-xl uppercase sm:text-2xl', statusTone)}>
            {connectionLabel(connection.state, connection.offlineReason)}
          </span>
        }
        footnote={
          connection.simulated
            ? 'Simulated by Chaos Lab'
            : connection.browserOnline
              ? 'Verified by backend health probe'
              : 'Browser reports no network'
        }
      />
    </div>
  );
}
