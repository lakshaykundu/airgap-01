import { incidentCode, sectorLabel } from '@airgap/shared';
import { memo } from 'react';
import type { LocalIncident } from '../../database/db';
import { cn } from '../../utils/cn';
import { formatRelative } from '../../utils/format';
import { SeverityBadge, StatusBadge, SyncBadge } from '../ui/Badge';

/** Memoized: rows only re-render when their own record object changes. */
export const IncidentRow = memo(function IncidentRow({
  incident,
  onSelect,
  selected,
  now,
}: {
  incident: LocalIncident;
  onSelect: (id: string) => void;
  selected?: boolean;
  now: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(incident.id)}
      data-testid="incident-row"
      data-incident-id={incident.id}
      data-sync={incident.syncStatus}
      className={cn(
        'group grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-b border-line/50 px-4 py-3 text-left transition-colors hover:bg-hover/40 @3xl:grid-cols-[88px_minmax(0,1fr)_96px_112px_92px]',
        selected && 'bg-primary/[0.05]',
      )}
    >
      <span className="font-mono text-[11px] text-fg-3 @3xl:order-none">
        {incidentCode(incident.id)}
      </span>
      <span className="col-span-2 min-w-0 @3xl:col-span-1">
        <span className="block truncate text-sm font-medium text-fg group-hover:text-white">
          {incident.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-fg-3">
          {sectorLabel(incident.sectorId)}
          {incident.assignedTo ? ` · ${incident.assignedTo}` : ''} ·{' '}
          {formatRelative(incident.updatedAt, now)}
        </span>
      </span>
      <span className="col-start-2 row-start-1 flex justify-end @3xl:col-auto @3xl:row-auto @3xl:justify-start">
        <SeverityBadge severity={incident.severity} />
      </span>
      <span className="hidden @3xl:block">
        <StatusBadge status={incident.status} />
      </span>
      <span className="hidden @3xl:block">
        <SyncBadge status={incident.syncStatus} />
      </span>
      <span className="col-span-2 flex gap-1.5 @3xl:hidden">
        <StatusBadge status={incident.status} />
        <SyncBadge status={incident.syncStatus} />
      </span>
    </button>
  );
});
