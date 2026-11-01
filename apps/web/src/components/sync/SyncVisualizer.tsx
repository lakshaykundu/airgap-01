import { incidentCode } from '@airgap/shared';
import { ArrowDown, ArrowRight, CircleCheck, Cpu, Database, Server } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActivityEvent, QueuedMutation } from '../../database/db';
import { useConnection } from '../../hooks/useConnection';
import { useActivity, useMutationQueue } from '../../hooks/useLiveData';
import { useNow } from '../../hooks/useNow';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { pad2 } from '../../utils/format';
import { cn } from '../../utils/cn';

const TYPE_LABEL: Record<QueuedMutation['type'], string> = {
  CREATE_INCIDENT: 'Incident created',
  UPDATE_INCIDENT: 'Incident updated',
  DELETE_INCIDENT: 'Incident deleted',
};

function Lane({
  title,
  icon,
  hint,
  children,
  tone,
  count,
}: {
  title: string;
  icon: ReactNode;
  hint: string;
  children: ReactNode;
  tone: string;
  count: number;
}) {
  return (
    <div className="flex min-h-[220px] flex-1 flex-col rounded-xl border border-line/80 bg-bg/40">
      <div className="flex items-center justify-between border-b border-line/60 px-3 py-2.5">
        <p
          className={cn(
            'flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase',
            tone,
          )}
        >
          {icon} {title}
        </p>
        <span className="font-mono text-[11px] text-fg-3 tabular-nums">{pad2(count)}</span>
      </div>
      <p className="px-3 pt-2 text-[11px] text-fg-3">{hint}</p>
      <ol className="flex flex-1 flex-col gap-1.5 p-3">{children}</ol>
    </div>
  );
}

function Card({
  id,
  title,
  sub,
  state,
  tone,
}: {
  id: string;
  title: string;
  sub: string;
  state: string;
  tone: string;
}) {
  return (
    <motion.li
      layout
      layoutId={id}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="rounded-lg border border-line bg-elevated/80 px-2.5 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-fg uppercase">{title}</span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider uppercase',
            tone,
          )}
        >
          {state}
        </span>
      </div>
      <p className="mt-0.5 truncate font-mono text-[10px] text-fg-3">{sub}</p>
    </motion.li>
  );
}

/**
 * Every card position is derived from real state: queue rows in IndexedDB
 * (local / engine lanes) and MUTATION_ACKNOWLEDGED events (server lane).
 * Cards share a layoutId per mutation, so a state change animates the card
 * from one lane to the next — nothing here is a canned animation.
 */
export function SyncVisualizer() {
  const queue = useMutationQueue() ?? [];
  const acknowledged = useActivity(40, ['sync']);
  const connection = useConnection();
  const now = useNow(1000);
  const stacked = useMediaQuery('(max-width: 1023px)');
  const pending = queue.length;
  const [celebrate, setCelebrate] = useState(false);
  const previous = useRef(pending);

  useEffect(() => {
    if (previous.current > 0 && pending === 0) {
      setCelebrate(true);
      const id = setTimeout(() => setCelebrate(false), 4500);
      previous.current = pending;
      return () => clearTimeout(id);
    }
    previous.current = pending;
  }, [pending]);

  const local = queue.filter(
    (m) =>
      (m.status === 'queued' && m.retryCount === 0) ||
      m.status === 'conflict' ||
      m.status === 'failed',
  );
  const engine = queue.filter(
    (m) => m.status === 'syncing' || (m.status === 'queued' && m.retryCount > 0),
  );
  const recentAcks: ActivityEvent[] = (acknowledged ?? [])
    .filter(
      (e) => e.type === 'MUTATION_ACKNOWLEDGED' && e.mutationId && now - Date.parse(e.ts) < 45_000,
    )
    .slice(0, 6);

  const Arrow = stacked ? ArrowDown : ArrowRight;

  return (
    <div className="relative" data-testid="sync-visualizer">
      <LayoutGroup>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <Lane
            title="Local storage"
            icon={<Database className="h-3.5 w-3.5" />}
            hint="Durable in IndexedDB · survives reloads"
            tone="text-[#c3b5ff]"
            count={local.length}
          >
            <AnimatePresence mode="popLayout">
              {local.map((m) => (
                <Card
                  key={m.id}
                  id={m.id}
                  title={TYPE_LABEL[m.type]}
                  sub={`${incidentCode(m.entityId)} · ${m.label}`}
                  state={
                    m.status === 'queued'
                      ? connection.canReachBackend
                        ? 'queued'
                        : 'held'
                      : m.status
                  }
                  tone={
                    m.status === 'conflict'
                      ? 'bg-warning/15 text-warning'
                      : m.status === 'failed'
                        ? 'bg-danger/15 text-danger'
                        : 'bg-accent/15 text-[#c3b5ff]'
                  }
                />
              ))}
            </AnimatePresence>
          </Lane>
          <div className="flex items-center justify-center text-fg-3" aria-hidden>
            <Arrow className={cn('h-4 w-4', engine.length > 0 && 'text-primary')} />
          </div>
          <Lane
            title="Sync engine"
            icon={<Cpu className="h-3.5 w-3.5" />}
            hint="Ordered · locked across tabs · backoff + jitter"
            tone="text-primary"
            count={engine.length}
          >
            <AnimatePresence mode="popLayout">
              {engine.map((m) => {
                const retryIn = m.nextRetryAt
                  ? Math.max(0, Math.ceil((Date.parse(m.nextRetryAt) - now) / 1000))
                  : 0;
                return (
                  <Card
                    key={m.id}
                    id={m.id}
                    title={TYPE_LABEL[m.type]}
                    sub={
                      m.status === 'syncing'
                        ? `${incidentCode(m.entityId)} · on the wire · attempt ${m.attempts}`
                        : `${incidentCode(m.entityId)} · retry #${m.retryCount} in ${retryIn}s`
                    }
                    state={m.status === 'syncing' ? 'processing' : 'retrying'}
                    tone={
                      m.status === 'syncing'
                        ? 'bg-primary/15 text-primary'
                        : 'bg-warning/15 text-warning'
                    }
                  />
                );
              })}
            </AnimatePresence>
          </Lane>
          <div className="flex items-center justify-center text-fg-3" aria-hidden>
            <Arrow className="h-4 w-4" />
          </div>
          <Lane
            title="Remote server"
            icon={<Server className="h-3.5 w-3.5" />}
            hint="Acknowledged · authoritative version assigned"
            tone="text-success"
            count={recentAcks.length}
          >
            <AnimatePresence mode="popLayout">
              {recentAcks.map((event) => (
                <Card
                  key={event.mutationId}
                  id={event.mutationId!}
                  title={
                    TYPE_LABEL[event.meta?.mutationType as QueuedMutation['type']] ?? 'Acknowledged'
                  }
                  sub={`${event.entityId ? incidentCode(event.entityId) : ''} · v${event.meta?.version ?? '?'}${event.meta?.replayed ? ' · idempotent replay' : ''}`}
                  state="synchronized"
                  tone="bg-success/15 text-success"
                />
              ))}
            </AnimatePresence>
          </Lane>
        </div>
      </LayoutGroup>
      <AnimatePresence>
        {celebrate && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 py-2.5 font-mono text-xs tracking-[0.18em] text-success uppercase"
            data-testid="all-synced"
          >
            <CircleCheck className="h-4 w-4" /> All changes synchronized
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
