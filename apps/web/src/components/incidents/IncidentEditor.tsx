import {
  OPERATORS,
  SECTORS,
  SEVERITIES,
  STATUSES,
  incidentCode,
  incidentFieldsSchema,
  pickIncidentFields,
  type IncidentFields,
} from '@airgap/shared';
import { CloudOff, Save } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import { useConnection } from '../../hooks/useConnection';
import { useIncident } from '../../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { SEVERITY_STYLES } from '../ui/badgeStyles';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select, Textarea } from '../ui/Field';

const EMPTY: IncidentFields = {
  title: '',
  description: '',
  severity: 'medium',
  status: 'open',
  sectorId: 's07',
  assignedTo: null,
};

type Errors = Partial<Record<keyof IncidentFields, string>>;

export const INCIDENT_CREATED_EVENT = 'airgap:incident-created';

function IncidentForm({
  initial,
  mode,
  onDone,
}: {
  initial: IncidentFields;
  mode: 'create' | 'edit';
  onDone: (id?: string) => void;
}) {
  const runtime = useRuntime();
  const dispatch = useAppDispatch();
  const editorTarget = useAppSelector((state) => state.ui.editor);
  const connection = useConnection();
  const [values, setValues] = useState<IncidentFields>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const id = (name: string) => `${formId}-${name}`;

  const set = <K extends keyof IncidentFields>(key: K, value: IncidentFields[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = incidentFieldsSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof IncidentFields;
        next[key] ??= issue.message;
      }
      setErrors(next);
      document.getElementById(id(Object.keys(next)[0] ?? 'title'))?.focus();
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        const incident = await runtime.createIncident(parsed.data);
        window.dispatchEvent(
          new CustomEvent(INCIDENT_CREATED_EVENT, { detail: { id: incident.id } }),
        );
        dispatch(
          uiActions.pushToast({
            tone: 'success',
            title: `${incidentCode(incident.id)} stored locally`,
            description: connection.canReachBackend
              ? 'Queued and synchronizing now.'
              : 'Queued — it will sync when the backend is reachable.',
          }),
        );
        onDone(incident.id);
      } else if (editorTarget && editorTarget !== 'new') {
        await runtime.updateIncident(editorTarget, parsed.data);
        dispatch(
          uiActions.pushToast({
            tone: 'success',
            title: 'Changes saved locally',
            description: connection.canReachBackend
              ? 'Synchronizing with the server.'
              : 'Queued until the backend is reachable.',
          }),
        );
        onDone(editorTarget);
      }
    } catch (error) {
      dispatch(
        uiActions.pushToast({
          tone: 'error',
          title: 'Could not save',
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex h-full flex-col"
      data-testid="incident-form"
    >
      <div className="flex-1 space-y-5 px-5 py-5">
        {!connection.canReachBackend && (
          <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Backend unreachable — this will be saved to IndexedDB and queued for sync.
          </p>
        )}
        <Field label="Incident title" htmlFor={id('title')} error={errors.title}>
          <Input
            id={id('title')}
            name="title"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Sector 07 — relay heartbeat lost"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? `${id('title')}-error` : undefined}
            autoFocus
            maxLength={140}
          />
        </Field>
        <Field label="Description" htmlFor={id('description')} error={errors.description}>
          <Textarea
            id={id('description')}
            name="description"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What was observed, where, and what is affected?"
            aria-invalid={Boolean(errors.description)}
            rows={4}
          />
        </Field>
        <fieldset>
          <legend className="label-xs mb-1.5 block text-fg-2">Severity</legend>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Severity">
            {SEVERITIES.map((severity) => (
              <button
                key={severity}
                type="button"
                role="radio"
                aria-checked={values.severity === severity}
                onClick={() => set('severity', severity)}
                className={cn(
                  'h-9 rounded-lg border font-mono text-[11px] uppercase tracking-wider transition-all',
                  values.severity === severity
                    ? cn(SEVERITY_STYLES[severity], 'ring-1 ring-current/40')
                    : 'border-line text-fg-3 hover:border-[#2f4260] hover:text-fg-2',
                )}
              >
                {severity}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sector" htmlFor={id('sectorId')} error={errors.sectorId}>
            <Select
              id={id('sectorId')}
              name="sectorId"
              value={values.sectorId}
              onChange={(e) => set('sectorId', e.target.value as IncidentFields['sectorId'])}
            >
              {SECTORS.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.code} — {sector.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned operator" htmlFor={id('assignedTo')}>
            <Select
              id={id('assignedTo')}
              name="assignedTo"
              value={values.assignedTo ?? ''}
              onChange={(e) => set('assignedTo', e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {[
                ...OPERATORS,
                ...(values.assignedTo && !OPERATORS.includes(values.assignedTo as never)
                  ? [values.assignedTo]
                  : []),
              ].map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor={id('status')}>
            <Select
              id={id('status')}
              name="status"
              value={values.status}
              onChange={(e) => set('status', e.target.value as IncidentFields['status'])}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status[0]!.toUpperCase() + status.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line/70 bg-surface/95 px-5 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          mono
          disabled={saving}
          data-testid="incident-submit"
        >
          <Save className="h-3.5 w-3.5" /> {mode === 'create' ? 'Create incident' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export function IncidentEditor() {
  const target = useAppSelector((state) => state.ui.editor);
  const dispatch = useAppDispatch();
  const existing = useIncident(target && target !== 'new' ? target : null);
  // The form copies `initial` into its own state on mount (it is keyed by
  // target), so live updates to the record never clobber what is being typed.
  const initial = target === 'new' ? EMPTY : existing ? pickIncidentFields(existing) : null;

  const mode = target === 'new' ? 'create' : 'edit';
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => !open && dispatch(uiActions.closeEditor())}
      eyebrow={
        mode === 'create'
          ? 'New record · local-first'
          : existing
            ? `${incidentCode(existing.id)} · base v${existing.version || '—'}`
            : 'Edit'
      }
      title={mode === 'create' ? 'Create incident' : 'Edit incident'}
      description={
        mode === 'create'
          ? 'Saved to IndexedDB first, then synchronized. Works offline.'
          : 'Edits are recorded against the last server version you saw.'
      }
    >
      {initial && (
        <IncidentForm
          key={String(target)}
          initial={initial}
          mode={mode}
          onDone={(id) => {
            dispatch(uiActions.closeEditor());
            if (id && mode === 'create') dispatch(uiActions.openDetail(null));
          }}
        />
      )}
    </Dialog>
  );
}
