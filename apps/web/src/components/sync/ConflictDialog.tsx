import {
  INCIDENT_FIELD_KEYS,
  OPERATORS,
  SECTORS,
  SEVERITIES,
  STATUSES,
  incidentCode,
  pickIncidentFields,
  sectorLabel,
  type IncidentFields,
} from '@airgap/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, GitMerge, Server, TriangleAlert, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import { loadConflict } from '../../services/sync/ConflictResolver';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input, Select, Textarea } from '../ui/Field';

const FIELD_LABELS: Record<keyof IncidentFields, string> = {
  title: 'Title',
  description: 'Description',
  severity: 'Severity',
  status: 'Status',
  sectorId: 'Sector',
  assignedTo: 'Assigned',
};

function display(key: keyof IncidentFields, value: IncidentFields[keyof IncidentFields]): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'sectorId') return sectorLabel(String(value));
  return String(value);
}

function MergeEditor({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: keyof IncidentFields;
  value: IncidentFields[keyof IncidentFields];
  onChange: (value: string | null) => void;
}) {
  const id = `merge-${fieldKey}`;
  const label = `Final ${FIELD_LABELS[fieldKey].toLowerCase()}`;
  switch (fieldKey) {
    case 'title':
      return (
        <Input
          id={id}
          aria-label={label}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        />
      );
    case 'description':
      return (
        <Textarea
          id={id}
          aria-label={label}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );
    case 'severity':
    case 'status': {
      const options = fieldKey === 'severity' ? SEVERITIES : STATUSES;
      return (
        <Select
          id={id}
          aria-label={label}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    }
    case 'sectorId':
      return (
        <Select
          id={id}
          aria-label={label}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        >
          {SECTORS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </Select>
      );
    case 'assignedTo': {
      const extra = value && !OPERATORS.includes(value as never) ? [String(value)] : [];
      return (
        <Select
          id={id}
          aria-label={label}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-9"
        >
          <option value="">Unassigned</option>
          {[...OPERATORS, ...extra].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    }
  }
}

/**
 * SYNC CONFLICT DETECTED — field-level comparison of the local version against
 * the authoritative server version. Nothing is overwritten until the operator
 * picks one of the three strategies.
 */
export function ConflictDialog() {
  const entityId = useAppSelector((state) => state.ui.conflictEntityId);
  const dispatch = useAppDispatch();
  const runtime = useRuntime();
  const view = useLiveQuery(
    () => (entityId ? loadConflict(runtime.db, entityId) : null),
    [entityId, runtime.db],
  );
  const [mode, setMode] = useState<'compare' | 'merge'>('compare');
  const [merged, setMerged] = useState<IncidentFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState(entityId);
  if (shownFor !== entityId) {
    setShownFor(entityId);
    setMode('compare');
    setMerged(null);
  }

  const close = () => dispatch(uiActions.openConflict(null));
  const server = view?.details.serverIncident ?? null;
  const local = view ? pickIncidentFields(view.local) : null;
  const differing = new Set(view?.differingFields ?? []);

  async function resolve(strategy: 'keep-local' | 'accept-server' | 'merge') {
    if (!entityId) return;
    setBusy(true);
    try {
      await runtime.resolveConflict(
        entityId,
        strategy,
        strategy === 'merge' ? (merged ?? undefined) : undefined,
      );
      dispatch(
        uiActions.pushToast({
          tone: 'success',
          title: 'Conflict resolved',
          description:
            strategy === 'accept-server'
              ? 'Local changes discarded; the server version is now shown.'
              : `A new mutation based on server v${view?.details.actualVersion ?? '?'} was queued.`,
        }),
      );
      close();
    } catch (error) {
      dispatch(
        uiActions.pushToast({
          tone: 'error',
          title: 'Could not resolve',
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(entityId)}
      onOpenChange={(open) => !open && close()}
      size="lg"
      eyebrow={entityId ? `${incidentCode(entityId)} · optimistic concurrency` : undefined}
      title={
        <span className="flex items-center gap-2 font-mono tracking-[0.12em] text-warning uppercase">
          <TriangleAlert className="h-4 w-4" /> Sync conflict detected
        </span>
      }
      description={
        view
          ? view.details.deleted
            ? 'This incident was deleted on the server while you were editing it offline.'
            : `Your change was based on v${view.details.expectedVersion}, but the server is now at v${view.details.actualVersion}. Choose what the final state should be.`
          : undefined
      }
    >
      {!view || !local ? (
        <p className="p-6 text-sm text-fg-2">
          {view === null ? 'This conflict has already been resolved.' : 'Loading conflict…'}
        </p>
      ) : (
        <div className="space-y-5 p-5" data-testid="conflict-dialog">
          <div className="grid grid-cols-[minmax(84px,auto)_1fr_1fr] overflow-hidden rounded-xl border border-line text-sm">
            <div className="border-b border-line bg-bg/50 px-3 py-2" />
            <div className="flex items-center gap-2 border-b border-l border-line bg-accent/[0.06] px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-[#c3b5ff] uppercase">
              <UserRound className="h-3.5 w-3.5" /> Local version
            </div>
            <div className="flex items-center gap-2 border-b border-l border-line bg-primary/[0.05] px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-primary uppercase">
              <Server className="h-3.5 w-3.5" /> Server version{' '}
              {server ? `· v${server.version}` : ''}
            </div>
            {INCIDENT_FIELD_KEYS.map((key) => {
              const changed = differing.has(key);
              return (
                <div
                  key={key}
                  className="contents"
                  data-testid={`conflict-row-${key}`}
                  data-differs={changed}
                >
                  <div
                    className={cn(
                      'border-b border-line/60 px-3 py-2.5 font-mono text-[11px] tracking-wider text-fg-3 uppercase',
                      changed && 'text-warning',
                    )}
                  >
                    {FIELD_LABELS[key]}
                    {changed && <span className="sr-only"> (differs)</span>}
                  </div>
                  <div
                    className={cn(
                      'border-b border-l border-line/60 px-3 py-2.5 break-words whitespace-pre-wrap',
                      changed ? 'bg-accent/[0.07] text-fg' : 'text-fg-3',
                    )}
                  >
                    {display(key, local[key])}
                  </div>
                  <div
                    className={cn(
                      'border-b border-l border-line/60 px-3 py-2.5 break-words whitespace-pre-wrap',
                      changed ? 'bg-primary/[0.06] text-fg' : 'text-fg-3',
                    )}
                  >
                    {server ? (
                      display(key, server[key])
                    ) : (
                      <span className="text-danger">Deleted on server</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {server && (
            <p className="font-mono text-[11px] text-fg-3">
              Server last updated {formatDateTime(server.updatedAt)} · {differing.size} field(s)
              differ · local edit{' '}
              {view.local.deleted ? 'is a pending DELETE' : 'is a pending UPDATE'}
            </p>
          )}

          {mode === 'merge' && server && merged && (
            <div
              className="space-y-3 rounded-xl border border-line bg-bg/40 p-4"
              data-testid="merge-editor"
            >
              <p className="label-xs">
                Review &amp; merge — pick a side per field, then adjust the final value
              </p>
              {INCIDENT_FIELD_KEYS.filter((key) => differing.has(key)).map((key) => (
                <div key={key} className="grid gap-2 sm:grid-cols-[110px_auto_1fr] sm:items-center">
                  <span className="font-mono text-[11px] tracking-wider text-fg-2 uppercase">
                    {FIELD_LABELS[key]}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      variant={merged[key] === local[key] ? 'secondary' : 'ghost'}
                      onClick={() => setMerged({ ...merged, [key]: local[key] })}
                    >
                      Mine
                    </Button>
                    <Button
                      size="xs"
                      variant={merged[key] === server[key] ? 'secondary' : 'ghost'}
                      onClick={() => setMerged({ ...merged, [key]: server[key] })}
                    >
                      Server
                    </Button>
                  </div>
                  <MergeEditor
                    fieldKey={key}
                    value={merged[key]}
                    onChange={(value) => setMerged({ ...merged, [key]: value })}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 pt-4">
            {mode === 'merge' ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setMode('compare')}>
                  Back
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  mono
                  disabled={busy}
                  onClick={() => resolve('merge')}
                  data-testid="apply-merge"
                >
                  <Check className="h-3.5 w-3.5" /> Apply merge
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  mono
                  disabled={busy || !server || view.local.deleted === 1}
                  onClick={() => {
                    setMerged(server ? { ...pickIncidentFields(server) } : null);
                    setMode('merge');
                  }}
                  data-testid="review-merge"
                >
                  <GitMerge className="h-3.5 w-3.5" /> Review &amp; merge
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  mono
                  disabled={busy}
                  onClick={() => resolve('accept-server')}
                  data-testid="accept-server"
                >
                  <Server className="h-3.5 w-3.5" /> Accept server version
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  mono
                  disabled={busy}
                  onClick={() => resolve('keep-local')}
                  data-testid="keep-local"
                >
                  <UserRound className="h-3.5 w-3.5" /> Keep my changes
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
