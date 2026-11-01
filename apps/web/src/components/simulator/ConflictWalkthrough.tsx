import { incidentCode } from '@airgap/shared';
import { GitBranch, Pencil, PlugZap, Satellite } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import { useIncidents } from '../../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';

/**
 * F — TRIGGER VERSION CONFLICT. Three real steps:
 * 1) edit an incident while disconnected (mutation based on vN is queued),
 * 2) another operator changes it on the server (vN+1),
 * 3) reconnect — the stale mutation gets a 409 and the resolver opens.
 */
export function ConflictWalkthrough() {
  const runtime = useRuntime();
  const dispatch = useAppDispatch();
  const incidents = useIncidents();
  const disconnected = useAppSelector((state) => state.simulator.disconnected);
  const conflictOpen = useAppSelector((state) => state.ui.conflictEntityId);
  const candidates = (incidents ?? []).filter((i) => i.version > 0);
  const [targetId, setTargetId] = useState<string>('');
  const [step, setStep] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = candidates.find((i) => i.id === targetId) ?? candidates[0];
  // Step 4 is reached when the server's 409 has actually landed on the incident.
  const conflictLanded = step === 3 && target?.syncStatus === 'conflict';
  const currentStep = conflictLanded ? 4 : step;
  const openedFor = useRef<string | null>(null);

  // Side effect only (no state): open the resolver once the conflict exists.
  useEffect(() => {
    if (conflictLanded && target && !conflictOpen && openedFor.current !== target.id) {
      openedFor.current = target.id;
      dispatch(uiActions.openConflict(target.id));
    }
  }, [conflictLanded, target, conflictOpen, dispatch]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      n: 1,
      title: 'Edit locally while disconnected',
      body: target
        ? `Queues an UPDATE for ${incidentCode(target.id)} based on server v${target.version}.`
        : 'Needs a synced incident.',
      action: (
        <Button
          size="xs"
          mono
          variant={currentStep === 1 ? 'primary' : 'ghost'}
          disabled={busy || !target || currentStep !== 1}
          onClick={() =>
            run(async () => {
              if (!disconnected) await runtime.setSimulatedDisconnect(true);
              await runtime.updateIncident(target!.id, {
                title: `${target!.title.replace(/ — edited offline$/, '')} — edited offline`,
                severity: 'critical',
              });
              setNote(`Local edit queued against v${target!.version}.`);
              setStep(2);
            })
          }
          data-testid="conflict-step-1"
        >
          <Pencil className="h-3 w-3" /> Edit offline
        </Button>
      ),
    },
    {
      n: 2,
      title: 'Another operator edits it on the server',
      body: 'Out-of-band request (another device) — bypasses this tab’s simulated disconnect.',
      action: (
        <Button
          size="xs"
          mono
          variant={currentStep === 2 ? 'primary' : 'ghost'}
          disabled={busy || currentStep !== 2}
          onClick={() =>
            run(async () => {
              const version = await runtime.remoteEditOutOfBand(target!.id);
              setNote(`Server is now at v${version}. Your queued edit is stale.`);
              setStep(3);
            })
          }
          data-testid="conflict-step-2"
        >
          <Satellite className="h-3 w-3" /> Simulate remote edit
        </Button>
      ),
    },
    {
      n: 3,
      title: 'Reconnect',
      body: 'The engine sends the stale mutation; the server rejects it with 409.',
      action: (
        <Button
          size="xs"
          mono
          variant={currentStep === 3 ? 'primary' : 'ghost'}
          disabled={busy || currentStep !== 3}
          onClick={() => run(() => runtime.setSimulatedDisconnect(false))}
          data-testid="conflict-step-3"
        >
          <PlugZap className="h-3 w-3" /> Restore connection
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <label className="block max-w-xl">
        <span className="label-xs">Target incident</span>
        <Select
          value={target?.id ?? ''}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={currentStep !== 1}
          className="mt-1 h-9"
          aria-label="Incident to put into conflict"
        >
          {candidates.slice(0, 50).map((incident) => (
            <option key={incident.id} value={incident.id}>
              {incidentCode(incident.id)} · v{incident.version} · {incident.title}
            </option>
          ))}
        </Select>
      </label>
      <ol className="grid gap-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li
            key={s.n}
            className={cn(
              'flex flex-wrap items-start gap-3 rounded-lg border px-3 py-3 lg:flex-col',
              currentStep === s.n
                ? 'border-primary/40 bg-primary/[0.04]'
                : currentStep > s.n
                  ? 'border-success/30'
                  : 'border-line/60 opacity-70',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px]',
                currentStep > s.n ? 'bg-success/20 text-success' : 'bg-elevated text-fg-2',
              )}
            >
              {s.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg">{s.title}</p>
              <p className="text-[11px] text-fg-3">{s.body}</p>
            </div>
            {s.action}
          </li>
        ))}
      </ol>
      {(conflictLanded || note) && (
        <p className="flex items-center gap-2 font-mono text-[11px] text-fg-2" role="status">
          <GitBranch className="h-3 w-3 text-warning" />{' '}
          {conflictLanded ? '409 VERSION_CONFLICT received — resolve it in the dialog.' : note}
        </p>
      )}
      {currentStep >= 4 && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setStep(1);
            setNote(null);
            openedFor.current = null;
          }}
        >
          Run again
        </Button>
      )}
    </div>
  );
}
