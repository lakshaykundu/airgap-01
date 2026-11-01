import {
  CircleSlash,
  FlaskConical,
  GitBranch,
  Hourglass,
  PlugZap,
  RotateCcw,
  Shuffle,
  Unplug,
  Zap,
} from 'lucide-react';
import { Slider } from 'radix-ui';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRuntime } from '../app/RuntimeContext';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { ConflictWalkthrough } from '../components/simulator/ConflictWalkthrough';
import { LoadTestPanel } from '../components/simulator/LoadTestPanel';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Field';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { StatusDot } from '../components/ui/StatusDot';
import { useConnection } from '../hooks/useConnection';
import { usePendingCount } from '../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../store';
import { LATENCY_PRESETS, simulatorActions } from '../store/simulatorSlice';
import { cn } from '../utils/cn';
import { formatTime } from '../utils/format';

function Control({
  letter,
  title,
  description,
  children,
  className,
}: {
  letter: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel lit className={cn('flex flex-col p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-bg font-mono text-[11px] text-primary">
          {letter}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-fg-2">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </Panel>
  );
}

function RequestTable() {
  const { transport } = useRuntime();
  const log = useSyncExternalStore(
    (cb) => transport.subscribeLog(cb),
    () => transport.requestLog,
  );
  return (
    <div className="max-h-72 overflow-y-auto" data-testid="request-log">
      <table className="w-full font-mono text-[11px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-fg-3">
            <th className="px-4 py-2 font-normal">Time</th>
            <th className="py-2 font-normal">Request</th>
            <th className="py-2 font-normal">Outcome</th>
            <th className="px-4 py-2 text-right font-normal">Measured</th>
          </tr>
        </thead>
        <tbody>
          {log.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-4 text-fg-3">
                No requests yet.
              </td>
            </tr>
          )}
          {log.map((entry) => (
            <tr key={entry.id} className="border-t border-line/40">
              <td className="px-4 py-1.5 text-fg-3">{formatTime(entry.at)}</td>
              <td className="max-w-[260px] truncate py-1.5 text-fg-2">
                {entry.method} {entry.path}
              </td>
              <td className={cn('py-1.5', entry.ok ? 'text-success' : 'text-danger')}>
                {entry.outcome}
                {entry.replayed && <span className="ml-1 text-warning">replay</span>}
              </td>
              <td className="px-4 py-1.5 text-right text-fg-2 tabular-nums">
                {entry.durationMs} ms
                {entry.injectedLatencyMs > 0 && (
                  <span className="text-fg-3"> (+{entry.injectedLatencyMs} sim)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ChaosLabPage() {
  const runtime = useRuntime();
  const sim = useAppSelector((state) => state.simulator);
  const dispatch = useAppDispatch();
  const connection = useConnection();
  const pending = usePendingCount();
  const [customLatency, setCustomLatency] = useState(
    String(sim.latencyPreset === 'custom' ? sim.latencyMs : 800),
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const presets: { id: 'normal' | '3g' | '2g'; label: string }[] = [
    { id: 'normal', label: 'Normal' },
    { id: '3g', label: `Simulated 3G — ${LATENCY_PRESETS['3g']} ms` },
    { id: '2g', label: `Simulated 2G — ${LATENCY_PRESETS['2g'].toLocaleString()} ms` },
  ];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Engineering playground"
        title={
          <span className="flex items-center gap-3">
            <FlaskConical className="h-7 w-7 text-accent" /> CHAOS LAB
          </span>
        }
        description="Test the system under imperfect conditions. Every control acts inside the app's transport layer, so all backend requests are affected — not just the status badge."
      />

      <div
        className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line/70 bg-surface/60 px-4 py-3 font-mono text-[11px] tracking-wider uppercase"
        data-testid="lab-status"
      >
        <span className="flex items-center gap-2">
          <StatusDot tone={connection.browserOnline ? 'success' : 'danger'} /> Browser:{' '}
          {connection.browserOnline ? 'online' : 'offline'}
        </span>
        <span className="flex items-center gap-2">
          <StatusDot tone={sim.disconnected ? 'danger' : 'success'} /> Simulated API:{' '}
          {sim.disconnected ? 'disconnected' : 'connected'}
        </span>
        <span className="flex items-center gap-2">
          <StatusDot tone={sim.latencyMs > 0 ? 'warning' : 'muted'} /> Latency: +{sim.latencyMs} ms
        </span>
        <span className="flex items-center gap-2">
          <StatusDot tone={sim.failureRate > 0 ? 'warning' : 'muted'} /> Failure rate:{' '}
          {Math.round(sim.failureRate * 100)}%
        </span>
        <span className="flex items-center gap-2">
          <StatusDot tone={sim.dropNextMutationResponse ? 'warning' : 'muted'} /> Drop next:{' '}
          {sim.dropNextMutationResponse ? 'armed' : 'off'}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Control
          letter="A/B"
          title="Simulated API disconnection"
          description="The transport rejects every backend request before it reaches the network. Persists across reloads. Your local work continues."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant={sim.disconnected ? 'secondary' : 'danger'}
              mono
              disabled={sim.disconnected}
              onClick={() => void runtime.setSimulatedDisconnect(true)}
              data-testid="lab-disconnect"
            >
              <Unplug className="h-4 w-4" /> Disconnect network
            </Button>
            <Button
              variant={sim.disconnected ? 'primary' : 'secondary'}
              mono
              disabled={!sim.disconnected}
              onClick={() => void runtime.setSimulatedDisconnect(false)}
              data-testid="lab-restore"
            >
              <PlugZap className="h-4 w-4" /> Restore connection
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-fg-3">
            To test a real outage, use DevTools → Network → Offline instead; the badge will say
            “Offline · browser”.
          </p>
        </Control>

        <Control
          letter="C"
          title="Slow network"
          description="Injects real delay before each request. Simulated latency only — bandwidth is not emulated."
        >
          <div className="space-y-1.5" role="radiogroup" aria-label="Latency preset">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={sim.latencyPreset === preset.id}
                onClick={() => {
                  dispatch(simulatorActions.setLatencyPreset(preset.id));
                  void runtime.logSimulator(`Latency preset → ${preset.label}`);
                }}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-left font-mono text-[11px] tracking-wider uppercase',
                  sim.latencyPreset === preset.id
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-line text-fg-2 hover:bg-hover',
                )}
              >
                <Hourglass className="h-3.5 w-3.5" /> {preset.label}
              </button>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = Number(customLatency);
                if (Number.isFinite(value)) {
                  dispatch(simulatorActions.setCustomLatency(value));
                  void runtime.logSimulator(`Latency → custom ${Math.round(value)} ms`);
                }
              }}
            >
              <Input
                aria-label="Custom latency in milliseconds"
                type="number"
                min={0}
                max={10000}
                step={50}
                value={customLatency}
                onChange={(e) => setCustomLatency(e.target.value)}
                className={cn('h-9', sim.latencyPreset === 'custom' && 'border-primary/50')}
              />
              <Button
                type="submit"
                size="sm"
                mono
                variant={sim.latencyPreset === 'custom' ? 'primary' : 'secondary'}
                className="h-9"
              >
                Custom
              </Button>
            </form>
          </div>
        </Control>

        <Control
          letter="D"
          title="Random failure rate"
          description="Data and mutation requests fail with this probability, from a seeded sequence. Health probes are exempt so status stays truthful."
        >
          <div className="flex items-center justify-between font-mono text-[11px] text-fg-3 uppercase">
            <span>Request failure rate</span>
            <span className="text-lg text-fg tabular-nums">
              {Math.round(sim.failureRate * 100)}%
            </span>
          </div>
          <Slider.Root
            className="relative mt-3 flex h-5 w-full touch-none items-center select-none"
            min={0}
            max={50}
            step={5}
            value={[Math.round(sim.failureRate * 100)]}
            onValueChange={([value]) =>
              dispatch(simulatorActions.setFailureRate((value ?? 0) / 100))
            }
            onValueCommit={([value]) => void runtime.logSimulator(`Failure rate → ${value}%`)}
            aria-label="Request failure rate"
          >
            <Slider.Track className="relative h-1.5 grow rounded-full bg-line">
              <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-warning to-danger" />
            </Slider.Track>
            <Slider.Thumb
              className="block h-4 w-4 rounded-full border-2 border-warning bg-bg shadow focus-visible:ring-4 focus-visible:ring-warning/30 focus-visible:outline-none"
              data-testid="failure-slider"
            />
          </Slider.Root>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-3">
            <span>0%</span>
            <span>50%</span>
          </div>
          <label className="mt-3 flex items-center gap-2 font-mono text-[11px] text-fg-3">
            <Shuffle className="h-3.5 w-3.5" /> Seed
            <Input
              type="number"
              value={sim.failureSeed}
              onChange={(e) =>
                dispatch(simulatorActions.setFailureSeed(Number(e.target.value) || 0))
              }
              className="h-8 w-24"
              aria-label="Failure sequence seed"
            />
          </label>
        </Control>

        <Control
          letter="E"
          title="Drop next mutation response"
          description="The server applies the next mutation, but the client discards the response — exactly like a lost ACK. The retry must not create a duplicate."
        >
          <Button
            variant={sim.dropNextMutationResponse ? 'secondary' : 'accent'}
            mono
            disabled={sim.dropNextMutationResponse}
            onClick={() => {
              dispatch(simulatorActions.armDropNextResponse());
              void runtime.logSimulator(
                'Armed: the next mutation response will be dropped after the server processes it',
              );
            }}
            data-testid="drop-next"
          >
            <CircleSlash className="h-4 w-4" />{' '}
            {sim.dropNextMutationResponse ? 'Armed — make an edit' : 'Drop next mutation response'}
          </Button>
          <p className="mt-3 text-[11px] text-fg-3">
            Then create or edit an incident while connected. Watch the console for RESPONSE_LOST
            followed by IDEMPOTENT_REPLAY.
          </p>
        </Control>

        <Control
          letter="G"
          title="Reset demo"
          description="Reseeds YOUR server session only, clears local data, the queue and simulator settings. Other visitors are unaffected."
        >
          <Button
            variant="danger"
            mono
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            data-testid="reset-demo"
          >
            <RotateCcw className="h-4 w-4" /> Reset demo
          </Button>
          {pending > 0 && (
            <p className="mt-3 text-[11px] text-warning">
              {pending} unsynchronized change(s) would be destroyed.
            </p>
          )}
        </Control>
        <Control
          letter="F"
          className="md:col-span-2 xl:col-span-3"
          title="Trigger version conflict"
          description="Uses the real demo-only remote-edit endpoint to make your queued edit stale."
        >
          <ConflictWalkthrough />
        </Control>
      </div>

      <Panel lit className="mt-4">
        <PanelHeader
          eyebrow="Measured by the transport (performance.now)"
          title="Request log"
          actions={<GitBranch className="h-4 w-4 text-fg-3" />}
        />
        <RequestTable />
      </Panel>

      <Panel lit className="mt-4">
        <PanelHeader
          eyebrow="Performance stress test"
          title="LOAD TEST / 1000"
          actions={<Zap className="h-4 w-4 text-primary" />}
        />
        <div className="p-4">
          <LoadTestPanel />
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        description={
          pending > 0 ? (
            <>
              <strong className="text-warning">{pending} unsynchronized change(s)</strong> in your
              local queue will be permanently destroyed. Your server session is reseeded with fresh
              fictional data.
            </>
          ) : (
            'Your server session is reseeded with fresh fictional data and local caches are cleared.'
          )
        }
        confirmLabel={pending > 0 ? `Destroy ${pending} change(s) and reset` : 'Reset demo'}
        onConfirm={() => {
          setBusy(true);
          void runtime.resetDemo().finally(() => setBusy(false));
        }}
      />
    </PageContainer>
  );
}
