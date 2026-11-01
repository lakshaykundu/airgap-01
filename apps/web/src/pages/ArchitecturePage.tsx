import {
  ArrowDown,
  Boxes,
  Database,
  HardDrive,
  Layers,
  ListOrdered,
  MonitorSmartphone,
  RefreshCcwDot,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { cn } from '../utils/cn';

interface Layer {
  id: string;
  title: string;
  icon: ReactNode;
  tagline: string;
  points: string[];
  files: string[];
}

const LAYERS: Layer[] = [
  {
    id: 'ui',
    title: 'React UI',
    icon: <MonitorSmartphone className="h-4 w-4" />,
    tagline: 'Renders local state. Never waits on the network to show or save work.',
    points: [
      'Pages are code-split; the service worker precaches every chunk so lazy routes load offline.',
      'Long lists are virtualized with TanStack Virtual; rows are memoized.',
      'Dialogs and drawers use Radix primitives for focus management and Escape-to-close.',
    ],
    files: ['apps/web/src/pages/*', 'apps/web/src/components/*'],
  },
  {
    id: 'hooks',
    title: 'Redux / local data hooks',
    icon: <Layers className="h-4 w-4" />,
    tagline: 'Two kinds of state, deliberately separated.',
    points: [
      'Redux Toolkit holds ephemeral UI state: filters (synced to the URL), panels, simulator config, connectivity snapshots.',
      'Durable data is NOT copied into Redux. Components read IndexedDB through Dexie live queries (useIncidents, usePendingCount…).',
      'Live queries re-run on any table change — in this tab or another tab — so every view stays consistent.',
    ],
    files: ['apps/web/src/store/*', 'apps/web/src/hooks/useLiveData.ts'],
  },
  {
    id: 'idb',
    title: 'IndexedDB',
    icon: <Database className="h-4 w-4" />,
    tagline: 'The local source of truth for application data.',
    points: [
      'Tables: incidents, mutationQueue, syncMetadata, activityEvents, stressTestRecords.',
      'Indexes on status, severity, sector, updatedAt, syncStatus; the queue is indexed by seq, entity, status and nextRetryAt.',
      'A local write and its queued mutation commit in ONE transaction — the UI and the queue can never disagree.',
      'Deletes keep a local tombstone until the server confirms, so records cannot reappear.',
    ],
    files: ['apps/web/src/database/db.ts', 'apps/web/src/database/incidentStore.ts'],
  },
  {
    id: 'queue',
    title: 'Mutation queue',
    icon: <ListOrdered className="h-4 w-4" />,
    tagline: 'Durable, ordered, idempotent.',
    points: [
      'Each mutation has a stable UUID that is sent as the Idempotency-Key on every attempt.',
      'Mutations record the last server version they were based on; the client never invents versions.',
      'When an earlier mutation for the same incident is acknowledged, later ones are rebased onto the new version.',
      'Create-then-delete made entirely offline cancels locally — nothing is sent.',
    ],
    files: ['apps/web/src/services/sync/mutationSchemas.ts'],
  },
  {
    id: 'engine',
    title: 'Sync engine',
    icon: <RefreshCcwDot className="h-4 w-4" />,
    tagline: 'Drains the queue only when the backend is actually reachable.',
    points: [
      'Reachability = browser online AND not simulated-offline AND a successful health probe / request. navigator.onLine alone is never trusted.',
      'Strictly sequential per entity: an UPDATE can never overtake its CREATE; a conflicted or failed mutation blocks only its own entity.',
      'Retryable failures (network, 408/429/5xx) back off exponentially: 1s, 2s, 4s… capped at 30s, ±20% jitter; parked after 8 retries.',
      'Web Locks ensure one tab drains at a time (localStorage lease fallback); BroadcastChannel wakes other tabs.',
      'On startup the lock holder re-queues anything left "syncing" by a crashed tab — safe because of idempotency keys.',
    ],
    files: [
      'apps/web/src/services/sync/SyncEngine.ts',
      'MutationProcessor.ts',
      'RetryManager.ts',
      'SyncCoordinator.ts',
      'ConflictResolver.ts',
    ],
  },
  {
    id: 'api',
    title: 'API server (Fastify)',
    icon: <Server className="h-4 w-4" />,
    tagline: 'Authoritative versions, idempotency, isolation.',
    points: [
      'Every write is validated with Zod and applied in a SQLite transaction together with its idempotency record.',
      'A retried request with the same key replays the stored response (Idempotent-Replay: true) — no duplicate writes.',
      'Updates/deletes must carry baseVersion; a stale one gets a structured 409 with the current server copy.',
      'Server-Sent Events push changes; a persisted event cursor lets clients catch up after any disconnect.',
      'Per-visitor demo sessions, rate limits, request size limits, CSP and security headers.',
    ],
    files: ['apps/server/src/services/incidentService.ts', 'apps/server/src/routes/*'],
  },
  {
    id: 'sqlite',
    title: 'SQLite',
    icon: <HardDrive className="h-4 w-4" />,
    tagline: 'Durable server state.',
    points: [
      'Tables: sessions, incidents (tombstoned deletes), incident_versions, processed_mutations, events.',
      'WAL mode; BEGIN IMMEDIATE transactions make version check + write atomic.',
      'Requires a persistent volume in production — an ephemeral filesystem would wipe demo sessions on redeploy.',
    ],
    files: ['apps/server/src/database/*'],
  },
];

const CONCEPTS = [
  {
    title: 'Idempotency',
    body: 'A lost response is indistinguishable from a lost request. The client always retries with the same key; the server remembers the result. Try it: Chaos Lab → Drop next mutation response.',
  },
  {
    title: 'Version conflicts',
    body: 'Optimistic concurrency: every incident has a server-assigned version. Stale writes are rejected with 409 and resolved by a human — keep mine, accept server, or merge field by field.',
  },
  {
    title: 'Retries',
    body: 'Only recoverable failures are retried, with exponential backoff and jitter so many clients do not retry in lockstep. Validation errors fail immediately and are surfaced.',
  },
  {
    title: 'Offline recovery',
    body: 'Everything needed to continue — data, queue, cursor, session, simulator state — is persisted. A reload mid-sync resumes from IndexedDB and resends safely.',
  },
];

export default function ArchitecturePage() {
  const [active, setActive] = useState('engine');
  const layer = LAYERS.find((l) => l.id === active)!;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="How it works"
        title="Architecture Viewer"
        description="Click a layer to see its responsibilities. The service worker caches the application shell; IndexedDB persists application data — two different jobs."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel lit className="p-4">
            <ol className="flex flex-col items-stretch" aria-label="Architecture layers">
              {LAYERS.map((item, index) => (
                <li key={item.id} className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setActive(item.id)}
                    aria-pressed={active === item.id}
                    className={cn(
                      'relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                      active === item.id
                        ? 'border-primary/60 bg-primary/[0.08] shadow-[0_0_24px_-8px_rgba(36,229,192,0.6)]'
                        : 'border-line bg-bg/40 hover:border-[#2f4260] hover:bg-hover/40',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-lg border',
                        active === item.id
                          ? 'border-primary/50 text-primary'
                          : 'border-line text-fg-3',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="font-mono text-[12px] tracking-[0.14em] uppercase">
                      {item.title}
                    </span>
                  </button>
                  {index < LAYERS.length - 1 && (
                    <span className="flex h-6 items-center text-fg-3" aria-hidden>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel lit className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/50 text-accent">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="font-mono text-[12px] tracking-[0.14em] text-[#c3b5ff] uppercase">
                  Service worker · separate concern
                </p>
                <p className="mt-1 text-sm text-fg-2">
                  Workbox precaches the app shell — HTML, JS chunks, CSS, bundled Geist fonts, icons
                  — so the console boots with no network. It never caches API responses: application
                  data comes from IndexedDB, and mutations go through the queue. Updates are
                  downloaded in the background and applied when you choose to reload.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <Panel lit>
                <PanelHeader eyebrow="Responsibilities" title={layer.title} />
                <div className="p-5">
                  <p className="text-[15px] text-fg">{layer.tagline}</p>
                  <ul className="mt-4 space-y-2.5">
                    {layer.points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm text-fg-2">
                        <span
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <p className="label-xs mt-5 flex items-center gap-1.5">
                    <Boxes className="h-3 w-3" /> Where to look
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {layer.files.map((file) => (
                      <li
                        key={file}
                        className="rounded-md border border-line bg-bg/50 px-2 py-0.5 font-mono text-[11px] text-fg-2"
                      >
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            </motion.div>
          </AnimatePresence>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONCEPTS.map((concept) => (
              <Panel key={concept.title} className="p-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-primary uppercase">
                  {concept.title}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{concept.body}</p>
              </Panel>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
