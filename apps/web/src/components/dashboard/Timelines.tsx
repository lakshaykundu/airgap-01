import { incidentCode } from '@airgap/shared';
import type { ActivityEvent } from '../../database/db';
import { useActivity } from '../../hooks/useLiveData';
import { cn } from '../../utils/cn';
import { formatTime } from '../../utils/format';
import { Skeleton } from '../ui/States';

const CONNECTION_LABELS: Record<string, { label: string; tone: string }> = {
  APP_STARTED: { label: 'CONSOLE STARTED', tone: 'bg-fg-3' },
  BACKEND_REACHABLE: { label: 'ONLINE', tone: 'bg-success' },
  BROWSER_ONLINE: { label: 'BROWSER ONLINE', tone: 'bg-success' },
  SIMULATED_RESTORE: { label: 'RECONNECTED', tone: 'bg-success' },
  BACKEND_UNREACHABLE: { label: 'BACKEND UNREACHABLE', tone: 'bg-danger' },
  BROWSER_OFFLINE: { label: 'BROWSER OFFLINE', tone: 'bg-danger' },
  SIMULATED_DISCONNECT: { label: 'DISCONNECTED (SIM)', tone: 'bg-danger' },
  INCIDENT_CREATED: { label: 'LOCAL WRITE', tone: 'bg-accent' },
  INCIDENT_UPDATED: { label: 'LOCAL WRITE', tone: 'bg-accent' },
  INCIDENT_RESOLVED: { label: 'LOCAL WRITE', tone: 'bg-accent' },
  INCIDENT_DELETED: { label: 'LOCAL WRITE', tone: 'bg-accent' },
  SYNC_STARTED: { label: 'SYNC STARTED', tone: 'bg-primary' },
  SYNC_COMPLETE: { label: 'SYNC COMPLETE', tone: 'bg-success' },
  SYNC_NEEDS_ATTENTION: { label: 'SYNC NEEDS ATTENTION', tone: 'bg-warning' },
  CONFLICT_DETECTED: { label: 'CONFLICT', tone: 'bg-warning' },
  RESPONSE_LOST: { label: 'RESPONSE LOST', tone: 'bg-warning' },
};

/** Connection-state transitions reconstructed from the real activity log. */
export function ConnectionTimeline({ limit = 10 }: { limit?: number }) {
  const events = useActivity(160);
  if (!events) return <Skeleton className="h-48 w-full" />;
  const rows = events.filter((e) => CONNECTION_LABELS[e.type]).slice(0, limit);
  if (rows.length === 0) return <p className="text-sm text-fg-3">No transitions recorded yet.</p>;
  return (
    <ol
      className="relative space-y-2.5 before:absolute before:top-1 before:bottom-1 before:left-[71px] before:w-px before:bg-line"
      data-testid="connection-timeline"
    >
      {rows.map((event) => {
        const meta = CONNECTION_LABELS[event.type]!;
        return (
          <li key={event.id} className="relative flex items-center gap-3 font-mono text-[11px]">
            <span className="w-[60px] shrink-0 text-fg-3 tabular-nums">{formatTime(event.ts)}</span>
            <span
              className={cn(
                'relative z-10 h-2 w-2 shrink-0 rounded-full ring-4 ring-surface',
                meta.tone,
              )}
              aria-hidden
            />
            <span className="tracking-[0.1em] text-fg-2">{meta.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const OPERATIONAL_TYPES = new Set([
  'INCIDENT_CREATED',
  'INCIDENT_UPDATED',
  'INCIDENT_RESOLVED',
  'INCIDENT_DELETED',
  'DB_WRITE_SUCCESS',
  'MUTATION_QUEUED',
  'MUTATION_ACKNOWLEDGED',
  'SYNC_STARTED',
  'SYNC_COMPLETE',
  'CONFLICT_DETECTED',
  'CONFLICT_RESOLVED',
  'REMOTE_CHANGE_DETECTED',
  'MUTATION_FAILED',
  'SESSION_CREATED',
]);

const SHORT: Record<string, string> = {
  INCIDENT_CREATED: 'Incident created',
  INCIDENT_UPDATED: 'Incident updated',
  INCIDENT_RESOLVED: 'Incident resolved',
  INCIDENT_DELETED: 'Incident deleted',
  DB_WRITE_SUCCESS: 'Incident stored locally',
  MUTATION_QUEUED: 'Synchronization queued',
  MUTATION_ACKNOWLEDGED: 'Server acknowledged',
  SYNC_STARTED: 'Synchronization started',
  SYNC_COMPLETE: 'Synchronization complete',
  CONFLICT_DETECTED: 'Conflict detected',
  CONFLICT_RESOLVED: 'Conflict resolved',
  REMOTE_CHANGE_DETECTED: 'Remote change detected',
  MUTATION_FAILED: 'Synchronization failed',
  SESSION_CREATED: 'Demo workspace created',
};

const DOT: Record<ActivityEvent['level'], string> = {
  info: 'bg-fg-3',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
};

export function ActivityTimeline({ limit = 12 }: { limit?: number }) {
  const events = useActivity(200);
  if (!events) return <Skeleton className="h-48 w-full" />;
  const rows = events.filter((e) => OPERATIONAL_TYPES.has(e.type)).slice(0, limit);
  if (rows.length === 0)
    return (
      <p className="text-sm text-fg-3">
        No activity yet. Create or edit an incident to see the pipeline.
      </p>
    );
  return (
    <ol className="space-y-2" data-testid="activity-timeline">
      {rows.map((event) => (
        <li key={event.id} className="flex items-start gap-3 text-[12.5px]">
          <span className="w-[60px] shrink-0 pt-px font-mono text-[11px] text-fg-3 tabular-nums">
            {formatTime(event.ts)}
          </span>
          <span
            className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', DOT[event.level])}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="text-fg">{SHORT[event.type] ?? event.type}</span>
            {event.entityId && (
              <span className="ml-1.5 font-mono text-[11px] text-fg-3">
                {incidentCode(event.entityId)}
              </span>
            )}
            {event.category === 'server' && (
              <span className="ml-1.5 rounded bg-primary/10 px-1 font-mono text-[9.5px] text-primary uppercase">
                server
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
