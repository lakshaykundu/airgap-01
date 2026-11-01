import { incidentCode } from '@airgap/shared';
import { ChevronDown, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import type { QueuedMutation } from '../../database/db';
import { useConnection } from '../../hooks/useConnection';
import { useMutationQueue } from '../../hooks/useLiveData';
import { useNow } from '../../hooks/useNow';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { formatTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { EmptyState } from '../ui/States';

const STATUS_STYLE: Record<QueuedMutation['status'], string> = {
  queued: 'text-[#c3b5ff] bg-accent/10 border-accent/30',
  syncing: 'text-primary bg-primary/10 border-primary/30',
  conflict: 'text-warning bg-warning/10 border-warning/40',
  failed: 'text-danger bg-danger/10 border-danger/40',
};

export function MutationCard({ mutation, now }: { mutation: QueuedMutation; now: number }) {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const retryIn = mutation.nextRetryAt
    ? Math.max(0, Math.ceil((Date.parse(mutation.nextRetryAt) - now) / 1000))
    : null;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="rounded-xl border border-line/80 bg-bg/40"
      data-testid="queue-item"
      data-status={mutation.status}
    >
      <div className="flex items-start gap-3 p-3">
        <span
          className={cn(
            'mt-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase',
            STATUS_STYLE[mutation.status],
          )}
        >
          {mutation.status === 'queued' && mutation.retryCount > 0 ? 'retrying' : mutation.status}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-fg">
            {mutation.type} <span className="text-fg-3">· {incidentCode(mutation.entityId)}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-fg-2">{mutation.label}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10.5px] text-fg-3 sm:grid-cols-4">
            <div>
              <dt className="sr-only">Mutation ID</dt>
              <dd title={mutation.id}>id {mutation.id.slice(0, 8)}</dd>
            </div>
            <div>
              <dt className="sr-only">Created</dt>
              <dd>{formatTime(mutation.createdAt)}</dd>
            </div>
            <div>
              <dt className="sr-only">Retries</dt>
              <dd>retries {mutation.retryCount}</dd>
            </div>
            <div>
              <dt className="sr-only">Next retry</dt>
              <dd>
                {retryIn !== null ? `next in ${retryIn}s` : `base v${mutation.baseVersion ?? '—'}`}
              </dd>
            </div>
          </dl>
          {mutation.lastError && (
            <p className="mt-2 rounded-md bg-danger/5 px-2 py-1 font-mono text-[10.5px] text-danger/90">
              {mutation.lastError}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-line/60 px-2 py-1.5">
        <Button size="xs" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} /> View
          details
        </Button>
        {mutation.status === 'conflict' && (
          <Button
            size="xs"
            variant="secondary"
            mono
            className="ml-auto text-warning"
            onClick={() => dispatch(uiActions.openConflict(mutation.entityId))}
            data-testid="resolve-conflict"
          >
            <TriangleAlert className="h-3 w-3" /> Resolve conflict
          </Button>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line/60 px-3 font-mono text-[10.5px] whitespace-pre-wrap text-fg-2"
          >
            <code className="block py-2">
              {JSON.stringify(
                {
                  idempotencyKey: mutation.id,
                  entityId: mutation.entityId,
                  baseVersion: mutation.baseVersion ?? null,
                  attempts: mutation.attempts,
                  payload: mutation.payload,
                  conflict: mutation.conflict ?? undefined,
                },
                null,
                2,
              )}
            </code>
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function QueueDrawer() {
  const open = useAppSelector((state) => state.ui.queueDrawerOpen);
  const dispatch = useAppDispatch();
  const runtime = useRuntime();
  const queue = useMutationQueue() ?? [];
  const connection = useConnection();
  const sync = useAppSelector((state) => state.connectivity.sync);
  const now = useNow(1000);
  const failed = queue.filter((m) => m.status === 'failed').length;
  const conflicts = queue.filter((m) => m.status === 'conflict').length;

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => dispatch(uiActions.setQueueDrawer(value))}
      eyebrow="Durable mutation queue · IndexedDB"
      title={`${String(queue.length).padStart(2, '0')} pending mutation${queue.length === 1 ? '' : 's'}`}
      description={
        connection.canReachBackend
          ? 'Processed in order, one at a time, with idempotency keys.'
          : 'Held locally until the backend is reachable.'
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            mono
            disabled={queue.length === 0 || !connection.canReachBackend || sync.phase === 'running'}
            onClick={() => void runtime.syncNow()}
            data-testid="sync-now"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sync.phase === 'running' && 'animate-spin')} />{' '}
            Sync now
          </Button>
          <Button
            variant="secondary"
            size="sm"
            mono
            disabled={failed === 0}
            onClick={() => void runtime.retryFailed()}
            data-testid="retry-failed"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Retry failed ({failed})
          </Button>
          {conflicts > 0 && (
            <Button
              variant="outline"
              size="sm"
              mono
              className="text-warning"
              onClick={() =>
                dispatch(
                  uiActions.openConflict(queue.find((m) => m.status === 'conflict')!.entityId),
                )
              }
            >
              <TriangleAlert className="h-3.5 w-3.5" /> Resolve conflict
            </Button>
          )}
        </div>
      }
    >
      <div className="p-4">
        {queue.length === 0 ? (
          <EmptyState
            icon={<RefreshCw className="h-6 w-6" />}
            title="All changes synchronized"
            description="Nothing is waiting to reach the server."
          />
        ) : (
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {queue.map((mutation) => (
                <MutationCard key={mutation.id} mutation={mutation} now={now} />
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </Sheet>
  );
}
