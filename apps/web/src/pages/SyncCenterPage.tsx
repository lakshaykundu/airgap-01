import { AnimatePresence } from 'motion/react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useRuntime } from '../app/RuntimeContext';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { MutationCard } from '../components/sync/QueueDrawer';
import { SyncVisualizer } from '../components/sync/SyncVisualizer';
import { Button } from '../components/ui/Button';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { EmptyState } from '../components/ui/States';
import { useConnection } from '../hooks/useConnection';
import { useLastSyncAt, useMutationQueue } from '../hooks/useLiveData';
import { useNow } from '../hooks/useNow';
import { useAppSelector } from '../store';
import { cn } from '../utils/cn';
import { formatMs, formatRelative, formatTime } from '../utils/format';

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line/70 bg-bg/40 px-3 py-2.5">
      <p className="label-xs">{label}</p>
      <p className={cn('mt-1 font-mono text-sm text-fg', tone)}>{value}</p>
    </div>
  );
}

export default function SyncCenterPage() {
  const runtime = useRuntime();
  const queue = useMutationQueue() ?? [];
  const connection = useConnection();
  const sync = useAppSelector((state) => state.connectivity.sync);
  const realtime = useAppSelector((state) => state.connectivity.realtime);
  const lockMechanism = useAppSelector((state) => state.connectivity.lockMechanism);
  const lastSyncAt = useLastSyncAt();
  const now = useNow(1000);
  const failed = queue.filter((m) => m.status === 'failed').length;
  const conflicts = queue.filter((m) => m.status === 'conflict').length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Mutation queue · sync engine · server"
        title="Synchronization Center"
        description="Watch real queue transitions. Add latency in the Chaos Lab to slow them down enough to follow each mutation across the pipeline."
        actions={
          <>
            <Button
              variant="secondary"
              mono
              size="sm"
              disabled={failed === 0}
              onClick={() => void runtime.retryFailed()}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry failed
            </Button>
            <Button
              variant="primary"
              mono
              size="sm"
              disabled={queue.length === 0 || !connection.canReachBackend}
              onClick={() => void runtime.syncNow()}
              data-testid="sync-center-sync-now"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', sync.phase === 'running' && 'animate-spin')}
              />{' '}
              Sync now
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Stat
          label="Pending"
          value={String(queue.length).padStart(2, '0')}
          tone={queue.length ? 'text-[#c3b5ff]' : undefined}
        />
        <Stat label="Conflicts" value={conflicts} tone={conflicts ? 'text-warning' : undefined} />
        <Stat label="Failed" value={failed} tone={failed ? 'text-danger' : undefined} />
        <Stat label="Engine" value={sync.phase} />
        <Stat
          label="Last sync"
          value={
            lastSyncAt ? `${formatTime(lastSyncAt)} · ${formatRelative(lastSyncAt, now)}` : 'never'
          }
        />
        <Stat label="Last run" value={formatMs(sync.lastDurationMs, 0)} />
        <Stat label="Realtime" value={realtime === 'live' ? 'SSE live' : realtime} />
        <Stat
          label="Tab lock"
          value={sync.lockedByOtherTab ? 'held by other tab' : lockMechanism}
        />
      </div>
      {sync.nextRetryAt && (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-2 font-mono text-[12px] text-warning">
          Backing off — next attempt in{' '}
          {Math.max(0, Math.ceil((Date.parse(sync.nextRetryAt) - now) / 1000))}s (exponential
          backoff with jitter)
        </p>
      )}
      <Panel lit className="p-4">
        <SyncVisualizer />
      </Panel>
      <Panel lit className="mt-4">
        <PanelHeader title="Queue" eyebrow="Ordered by sequence · persisted in IndexedDB" />
        <div className="p-4">
          {queue.length === 0 ? (
            <EmptyState
              icon={<RefreshCw className="h-6 w-6" />}
              title="Queue is empty"
              description="Disconnect in the Chaos Lab and make a few edits to fill it."
            />
          ) : (
            <ol className="grid gap-2 lg:grid-cols-2">
              <AnimatePresence initial={false}>
                {queue.map((mutation) => (
                  <MutationCard key={mutation.id} mutation={mutation} now={now} />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
      </Panel>
    </PageContainer>
  );
}
