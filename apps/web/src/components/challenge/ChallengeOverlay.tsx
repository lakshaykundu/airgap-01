import { incidentCode } from '@airgap/shared';
import { Check, ExternalLink, Network, PlugZap, Plus, RotateCw, Unplug, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useRuntime } from '../../app/RuntimeContext';
import type { Runtime } from '../../app/runtime';
import { candidate } from '../../config/candidate';
import { usePendingCount } from '../../hooks/useLiveData';
import { NetworkError } from '../../services/api/transport';
import { useAppDispatch, useAppSelector } from '../../store';
import { challengeActions, type ChallengeStep, type CheckResult } from '../../store/challengeSlice';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { pad2 } from '../../utils/format';
import { INCIDENT_CREATED_EVENT } from '../incidents/IncidentEditor';
import { Button } from '../ui/Button';

const STEPS: { id: ChallengeStep; label: string }[] = [
  { id: 'disconnect', label: 'Disconnect' },
  { id: 'create', label: 'Create offline' },
  { id: 'persist', label: 'Reload test' },
  { id: 'reconnect', label: 'Reconnect' },
  { id: 'complete', label: 'Done' },
];

/** Adds the spotlight ring to an element tagged with data-tour while mounted. */
function useSpotlight(target: string | null) {
  useEffect(() => {
    if (!target) return;
    const elements = document.querySelectorAll(`[data-tour="${target}"]`);
    elements.forEach((el) => el.classList.add('tour-highlight'));
    return () => elements.forEach((el) => el.classList.remove('tour-highlight'));
  }, [target]);
}

// ── real verifications ────────────────────────────────────────────────────
async function verifyDisconnected(runtime: Runtime): Promise<CheckResult> {
  try {
    await runtime.api.health();
    return { ok: false, detail: 'A health request still reached the server.' };
  } catch (error) {
    if (error instanceof NetworkError && error.kind === 'simulated-disconnect') {
      return {
        ok: true,
        detail: 'Transport rejected a live health request: simulated-disconnect.',
      };
    }
    return {
      ok: true,
      detail: `Backend unreachable (${error instanceof Error ? error.message : 'error'}).`,
    };
  }
}

async function verifyStoredLocally(runtime: Runtime, id: string): Promise<CheckResult> {
  const record = await runtime.db.incidents.get(id);
  const mutations = await runtime.db.mutationQueue.where('entityId').equals(id).toArray();
  if (!record) return { ok: false, detail: `${incidentCode(id)} is not in IndexedDB.` };
  if (!mutations.some((m) => m.type === 'CREATE_INCIDENT')) {
    return {
      ok: false,
      detail: `${incidentCode(id)} exists but has no queued CREATE mutation (was it already synced?).`,
    };
  }
  return {
    ok: true,
    detail: `${incidentCode(id)} found in IndexedDB with a queued CREATE_INCIDENT mutation.`,
  };
}

async function verifyOnServer(runtime: Runtime, id: string): Promise<CheckResult> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const outstanding = await runtime.db.mutationQueue.where('entityId').equals(id).count();
    if (outstanding === 0) {
      try {
        const res = await runtime.api.getIncident(id);
        return {
          ok: true,
          detail: `GET /api/incidents/${id.slice(0, 8)}… → ${res.status}, server v${res.data.incident.version}.`,
        };
      } catch (error) {
        return {
          ok: false,
          detail: `Queue drained but the server lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { ok: false, detail: 'Timed out waiting for the server to acknowledge the incident.' };
}

function CheckLine({ label, result }: { label: string; result: CheckResult | null }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
          result?.ok
            ? 'border-success/60 bg-success/15 text-success'
            : result
              ? 'border-danger/60 bg-danger/15 text-danger'
              : 'border-line text-fg-3',
        )}
      >
        {result?.ok ? <Check className="h-3 w-3" /> : result ? <X className="h-3 w-3" /> : null}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[12px] tracking-[0.12em] text-fg uppercase">{label}</p>
        {result && <p className="mt-0.5 text-[11px] text-fg-3">{result.detail}</p>}
      </div>
    </li>
  );
}

export function ChallengeOverlay() {
  const challenge = useAppSelector((state) => state.challenge);
  const disconnected = useAppSelector((state) => state.simulator.disconnected);
  const dispatch = useAppDispatch();
  const runtime = useRuntime();
  const navigate = useNavigate();
  const pending = usePendingCount();
  const [busy, setBusy] = useState(false);
  const verifyingReload = useRef(false);

  const spotlight = !challenge.active
    ? null
    : challenge.step === 'disconnect' || challenge.step === 'reconnect'
      ? 'network-toggle'
      : challenge.step === 'create' && challenge.results.preserved?.ok
        ? 'queue-counter'
        : null;
  useSpotlight(spotlight);

  // Step 1 → advance only once the transport really refuses requests.
  useEffect(() => {
    if (!challenge.active || challenge.step !== 'disconnect' || !disconnected) return;
    void verifyDisconnected(runtime).then((result) =>
      dispatch(challengeActions.recordDisconnected(result)),
    );
  }, [challenge.active, challenge.step, disconnected, runtime, dispatch]);

  // Step 2 → listen for the editor's "created" event and verify IndexedDB.
  useEffect(() => {
    if (!challenge.active || challenge.step !== 'create') return;
    const onCreated = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail.id;
      void verifyStoredLocally(runtime, id).then((result) =>
        dispatch(challengeActions.recordCreated({ incidentId: id, result })),
      );
    };
    window.addEventListener(INCIDENT_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(INCIDENT_CREATED_EVENT, onCreated);
  }, [challenge.active, challenge.step, runtime, dispatch]);

  // Step 3 (after reload) → verify the incident survived in IndexedDB.
  useEffect(() => {
    if (
      !challenge.active ||
      !challenge.reloadPending ||
      !challenge.incidentId ||
      verifyingReload.current
    )
      return;
    verifyingReload.current = true;
    void verifyStoredLocally(runtime, challenge.incidentId).then((result) =>
      dispatch(
        challengeActions.recordReload({
          ok: result.ok,
          detail: `After a full page reload: ${result.detail}`,
        }),
      ),
    );
  }, [challenge.active, challenge.reloadPending, challenge.incidentId, runtime, dispatch]);

  if (!challenge.active) return null;
  const stepIndex = STEPS.findIndex((s) => s.id === challenge.step);

  let body: ReactNode = null;
  switch (challenge.step) {
    case 'disconnect':
      body = (
        <>
          <p className="text-sm text-fg">
            Disconnect the API. The application should remain usable.
          </p>
          <Button
            variant="primary"
            mono
            className="mt-4 w-full justify-center"
            onClick={() => void runtime.setSimulatedDisconnect(true)}
            data-testid="challenge-disconnect"
          >
            <Unplug className="h-4 w-4" /> Disconnect network
          </Button>
          {challenge.results.disconnected && !challenge.results.disconnected.ok && (
            <p className="mt-2 text-xs text-danger">{challenge.results.disconnected.detail}</p>
          )}
        </>
      );
      break;
    case 'create':
      body = challenge.results.preserved?.ok ? (
        <>
          <p
            className="font-mono text-sm tracking-[0.14em] text-[#c3b5ff] uppercase"
            data-testid="challenge-pending"
          >
            Pending sync: {pad2(pending)}
          </p>
          <p className="mt-1 text-sm text-fg">Your change is safely stored locally.</p>
          <p className="mt-1 text-[11px] text-fg-3">{challenge.results.preserved.detail}</p>
          <Button
            variant="primary"
            mono
            className="mt-4 w-full justify-center"
            onClick={() => dispatch(challengeActions.advanceToPersist())}
            data-testid="challenge-next"
          >
            Next: reload test
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-fg">Create an incident while disconnected.</p>
          <Button
            variant="primary"
            mono
            className="mt-4 w-full justify-center"
            onClick={() => dispatch(uiActions.openEditor('new'))}
            data-testid="challenge-create"
          >
            <Plus className="h-4 w-4" /> Create incident
          </Button>
          {challenge.results.preserved && (
            <p className="mt-2 text-xs text-danger">{challenge.results.preserved.detail}</p>
          )}
        </>
      );
      break;
    case 'persist':
      body = (
        <>
          <p className="text-sm text-fg">
            Try refreshing the browser. Your work should still be here.
          </p>
          {challenge.results.reload && !challenge.results.reload.ok && (
            <p
              className="mt-2 rounded-lg border border-danger/40 bg-danger/5 p-2 text-xs text-danger"
              role="alert"
            >
              Persistence check failed — {challenge.results.reload.detail}
            </p>
          )}
          <Button
            variant="primary"
            mono
            className="mt-4 w-full justify-center"
            disabled={busy || challenge.reloadPending}
            onClick={() => {
              setBusy(true);
              dispatch(challengeActions.markReloadPending());
              // The store subscription has written localStorage synchronously; reload for real.
              setTimeout(() => window.location.reload(), 60);
            }}
            data-testid="challenge-test-persistence"
          >
            <RotateCw className="h-4 w-4" />{' '}
            {challenge.reloadPending ? 'Verifying…' : 'Test persistence'}
          </Button>
        </>
      );
      break;
    case 'reconnect':
      body = (
        <>
          {challenge.results.reload && (
            <p className="mb-2 text-[11px] text-success">✓ {challenge.results.reload.detail}</p>
          )}
          <p className="text-sm text-fg">Reconnect and watch your changes synchronize.</p>
          <Button
            variant="primary"
            mono
            className="mt-4 w-full justify-center"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              navigate('/sync');
              await runtime.setSimulatedDisconnect(false);
              const result = await verifyOnServer(runtime, challenge.incidentId!);
              dispatch(challengeActions.recordSynced(result));
              setBusy(false);
            }}
            data-testid="challenge-restore"
          >
            <PlugZap className="h-4 w-4" /> {busy ? 'Synchronizing…' : 'Restore connection'}
          </Button>
          {challenge.results.synced && !challenge.results.synced.ok && (
            <p className="mt-2 text-xs text-danger">{challenge.results.synced.detail}</p>
          )}
        </>
      );
      break;
    case 'complete':
      body = (
        <div data-testid="challenge-complete">
          <p className="font-mono text-sm tracking-[0.2em] text-primary uppercase">
            Challenge complete
          </p>
          <ul className="mt-4 space-y-3">
            <CheckLine label="Network disconnected" result={challenge.results.disconnected} />
            <CheckLine label="Local changes preserved" result={challenge.results.preserved} />
            <CheckLine label="Reload survived" result={challenge.results.reload} />
            <CheckLine label="Server synchronized" result={challenge.results.synced} />
          </ul>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-5 text-base font-semibold tracking-tight text-gradient"
          >
            THE NETWORK FAILED. YOUR WORK DIDN&apos;T.
          </motion.p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              mono
              onClick={() => {
                dispatch(challengeActions.exit());
                navigate('/architecture');
              }}
            >
              <Network className="h-3.5 w-3.5" /> Explore the architecture
            </Button>
            {candidate.links.source && (
              <a
                href={candidate.links.source}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-xs tracking-[0.08em] text-fg-2 uppercase hover:bg-hover hover:text-fg"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View source code
              </a>
            )}
          </div>
        </div>
      );
      break;
  }

  return (
    <AnimatePresence>
      <motion.aside
        key="challenge"
        role="dialog"
        aria-modal="false"
        aria-label="60-second challenge"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="panel panel-lit fixed right-4 bottom-4 left-4 z-[55] bg-surface/95 p-5 sm:left-auto sm:w-[380px]"
        data-testid="challenge-overlay"
        data-step={challenge.step}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label-xs text-primary">
              60-second challenge · step {Math.min(stepIndex + 1, 4)} / 4
            </p>
            <p className="mt-1 text-sm font-semibold">{STEPS[stepIndex]?.label}</p>
          </div>
          <button
            type="button"
            onClick={() => dispatch(challengeActions.exit())}
            className="rounded p-1 text-fg-3 hover:bg-hover hover:text-fg"
            aria-label="Exit challenge"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {STEPS.slice(0, 4).map((step, index) => (
            <span
              key={step.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                index < stepIndex || challenge.step === 'complete'
                  ? 'bg-primary'
                  : index === stepIndex
                    ? 'bg-primary/40'
                    : 'bg-line',
              )}
            />
          ))}
        </div>
        <div className="mt-4" aria-live="polite">
          {body}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
