import {
  NODES_BY_ID,
  STATUSES,
  incidentCode,
  nodeIdForIncident,
  sectorLabel,
  type IncidentStatus,
} from '@airgap/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  GitPullRequestArrow,
  Pencil,
  RotateCcw,
  Satellite,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import { useConnection } from '../../hooks/useConnection';
import { useIncident } from '../../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { formatDateTime, formatRelative } from '../../utils/format';
import { SeverityBadge, StatusBadge, SyncBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Sheet } from '../ui/Sheet';
import { EmptyState } from '../ui/States';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-xs">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

export function IncidentDetailDrawer() {
  const id = useAppSelector((state) => state.ui.detailId);
  const dispatch = useAppDispatch();
  const runtime = useRuntime();
  const connection = useConnection();
  const incident = useIncident(id);
  const pending = useLiveQuery(
    () => (id ? runtime.db.mutationQueue.where('entityId').equals(id).sortBy('seq') : []),
    [id, runtime.db],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => dispatch(uiActions.openDetail(null));
  const visible = incident && incident.deleted !== 1 ? incident : null;

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      dispatch(
        uiActions.pushToast({
          tone: 'error',
          title: `${label} failed`,
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  const node = visible ? NODES_BY_ID[nodeIdForIncident(visible)] : undefined;

  return (
    <>
      <Sheet
        open={Boolean(id)}
        onOpenChange={(open) => !open && close()}
        eyebrow={
          visible
            ? `${incidentCode(visible.id)} · ${visible.version ? `server v${visible.version}` : 'not yet on server'}`
            : 'Incident'
        }
        title={visible?.title ?? 'Incident unavailable'}
        footer={
          visible && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                mono
                onClick={() => dispatch(uiActions.openEditor(visible.id))}
                data-testid="edit-incident"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                mono
                onClick={() => setConfirmDelete(true)}
                data-testid="delete-incident"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                mono
                className="ml-auto"
                disabled={!connection.canReachBackend || busy || visible.version === 0}
                title={
                  visible.version === 0
                    ? 'Not on the server yet'
                    : !connection.canReachBackend
                      ? 'Requires backend connectivity'
                      : undefined
                }
                onClick={() =>
                  run('Remote edit', async () => {
                    await runtime.triggerRemoteEdit(visible.id);
                    dispatch(
                      uiActions.pushToast({
                        tone: 'warning',
                        title: 'Remote edit applied on the server',
                        description:
                          'Edit this incident locally while it is pending to see a conflict.',
                      }),
                    );
                  })
                }
                data-testid="simulate-remote-edit"
              >
                <Satellite className="h-3.5 w-3.5" /> Simulate remote edit
              </Button>
            </div>
          )
        }
      >
        {!visible ? (
          <EmptyState
            icon={<Undo2 className="h-6 w-6" />}
            title="This incident no longer exists locally"
            description="It may have been deleted in this or another tab."
          />
        ) : (
          <div className="space-y-6 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={visible.severity} />
              <StatusBadge status={visible.status} />
              <SyncBadge status={visible.syncStatus} />
            </div>

            {visible.syncStatus === 'conflict' && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-warning">Sync conflict</p>
                  <p className="text-fg-2">
                    The server changed this incident after your edit was based on it.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  mono
                  onClick={() => dispatch(uiActions.openConflict(visible.id))}
                >
                  Resolve
                </Button>
              </div>
            )}
            {visible.syncStatus === 'failed' && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
                <p className="flex-1 text-danger">
                  A mutation for this incident was rejected or gave up retrying.
                </p>
                <Button
                  size="xs"
                  variant="secondary"
                  mono
                  onClick={() => run('Retry', () => runtime.retryFailed(visible.id))}
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </Button>
                <Button
                  size="xs"
                  variant="danger"
                  mono
                  onClick={() => run('Discard', () => runtime.discard(visible.id))}
                >
                  Discard local
                </Button>
              </div>
            )}

            <div>
              <p className="label-xs mb-2">Quick status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((status: IncidentStatus) => (
                  <Button
                    key={status}
                    size="xs"
                    mono
                    variant={visible.status === status ? 'secondary' : 'ghost'}
                    aria-pressed={visible.status === status}
                    disabled={busy || visible.status === status}
                    onClick={() =>
                      run('Status change', () => runtime.updateIncident(visible.id, { status }))
                    }
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="label-xs mb-1.5">Description</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">
                {visible.description || <span className="text-fg-3">No description.</span>}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-4">
              <Meta label="Sector">{sectorLabel(visible.sectorId)}</Meta>
              <Meta label="Node">{node ? `${node.name}` : '—'}</Meta>
              <Meta label="Assigned">
                {visible.assignedTo ?? <span className="text-fg-3">Unassigned</span>}
              </Meta>
              <Meta label="Server version">
                {visible.version ? (
                  `v${visible.version}`
                ) : (
                  <span className="text-fg-3">pending create</span>
                )}
              </Meta>
              <Meta label="Created">{formatDateTime(visible.createdAt)}</Meta>
              <Meta label="Updated">
                {formatDateTime(visible.updatedAt)}{' '}
                <span className="text-fg-3">· {formatRelative(visible.updatedAt)}</span>
              </Meta>
            </dl>

            <div>
              <p className="label-xs mb-2 flex items-center gap-1.5">
                <GitPullRequestArrow className="h-3 w-3" /> Outstanding mutations (
                {pending?.length ?? 0})
              </p>
              {pending && pending.length > 0 ? (
                <ol className="space-y-1.5">
                  {pending.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border border-line/70 bg-bg/40 px-3 py-2 font-mono text-[11px]"
                    >
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5',
                          m.status === 'conflict'
                            ? 'bg-warning/10 text-warning'
                            : m.status === 'failed'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-accent/10 text-[#c3b5ff]',
                        )}
                      >
                        {m.status}
                      </span>
                      <span className="text-fg">{m.type.replace('_INCIDENT', '')}</span>
                      <span className="truncate text-fg-3">{m.label}</span>
                      <span className="ml-auto shrink-0 text-fg-3">
                        base v{m.baseVersion ?? '—'}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-fg-3">None — this incident matches the server.</p>
              )}
            </div>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this incident?"
        description={
          visible?.version === 0
            ? 'It has not reached the server yet, so its queued create will simply be cancelled.'
            : 'It is hidden immediately and a DELETE is queued. A tombstone keeps it from reappearing until the server confirms.'
        }
        confirmLabel="Delete incident"
        onConfirm={() =>
          visible &&
          run('Delete', async () => {
            const result = await runtime.deleteIncident(visible.id);
            close();
            dispatch(
              uiActions.pushToast({
                tone: 'success',
                title:
                  result === 'cancelled-locally' ? 'Create cancelled locally' : 'Deletion queued',
                description:
                  result === 'cancelled-locally'
                    ? 'Nothing needed to reach the server.'
                    : 'The server will be updated when reachable.',
              }),
            );
          })
        }
      />
    </>
  );
}
