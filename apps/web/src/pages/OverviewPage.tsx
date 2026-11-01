import { nodeIdForIncident } from '@airgap/shared';
import { ArrowRight, Play, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ActivityTimeline, ConnectionTimeline } from '../components/dashboard/Timelines';
import { SummaryCards } from '../components/dashboard/SummaryCards';
import { IncidentRow } from '../components/incidents/IncidentRow';
import { PageContainer } from '../components/layout/PageHeader';
import { MapLegend, OperationsMap } from '../components/map/OperationsMap';
import { NODE_STATUSES, type NodeStatus } from '../components/map/mapModel';
import { Button } from '../components/ui/Button';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/States';
import { useIncidents } from '../hooks/useLiveData';
import { useNow } from '../hooks/useNow';
import { useAppDispatch } from '../store';
import { challengeActions } from '../store/challengeSlice';
import { uiActions } from '../store/uiSlice';

const SeverityChart = lazy(() => import('../components/dashboard/SeverityChart'));

export function OverviewPage() {
  const incidents = useIncidents();
  const dispatch = useAppDispatch();
  const now = useNow(30_000);
  const [visible, setVisible] = useState<NodeStatus[]>(NODE_STATUSES);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const recent = useMemo(() => {
    const list = incidents ?? [];
    return (selectedNode ? list.filter((i) => nodeIdForIncident(i) === selectedNode) : list).slice(
      0,
      7,
    );
  }, [incidents, selectedNode]);

  return (
    <PageContainer>
      <section className="relative mb-8 grid gap-6 2xl:grid-cols-[1fr_auto] 2xl:items-end">
        <div>
          <p className="label-xs text-primary/80">Operations overview</p>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 text-[34px] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-5xl"
          >
            <span className="text-gradient">NO SIGNAL.</span>
            <br />
            STILL IN CONTROL.
          </motion.h1>
          <p className="mt-3 max-w-xl text-sm text-fg-2 sm:text-[15px]">
            An offline-first operations console. Every action is stored locally first, queued
            durably, and synchronized with idempotency and conflict detection when the backend
            answers. Pull the plug — it keeps working.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="lg"
            mono
            onClick={() => dispatch(challengeActions.start())}
            data-testid="start-challenge"
            className="relative overflow-hidden"
          >
            <Play className="h-4 w-4" /> Start the 60-second challenge
          </Button>
          <Button
            variant="secondary"
            size="lg"
            mono
            onClick={() => dispatch(uiActions.openEditor('new'))}
            data-tour="create-incident"
          >
            <Plus className="h-4 w-4" /> Create incident
          </Button>
        </div>
      </section>

      <SummaryCards incidents={incidents} />

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel lit className="overflow-hidden">
          <PanelHeader
            eyebrow="Meridian Basin · 8 sectors · 32 nodes"
            title="Operations map"
            actions={
              <Link
                to="/map"
                className="flex items-center gap-1 font-mono text-[11px] tracking-wider text-fg-2 uppercase hover:text-primary"
              >
                Full map <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <div className="p-3">
            <OperationsMap
              incidents={incidents ?? []}
              visibleStatuses={visible}
              selectedNodeId={selectedNode}
              onSelectNode={setSelectedNode}
              className="aspect-[1000/640] w-full"
              compact
            />
            <div className="mt-3">
              <MapLegend
                visible={visible}
                onToggle={(status) =>
                  setVisible((current) =>
                    current.includes(status)
                      ? current.filter((s) => s !== status)
                      : [...current, status],
                  )
                }
              />
            </div>
          </div>
        </Panel>

        <Panel lit className="flex min-h-0 flex-col overflow-hidden">
          <PanelHeader
            eyebrow={selectedNode ? `Filtered to node ${selectedNode}` : 'Most recently updated'}
            title="Incident feed"
            actions={
              <Link
                to="/incidents"
                className="flex items-center gap-1 font-mono text-[11px] tracking-wider text-fg-2 uppercase hover:text-primary"
              >
                All <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <div
            className="@container max-h-[520px] min-h-0 flex-1 overflow-y-auto"
            data-testid="incident-feed"
          >
            {!incidents ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="p-6 text-sm text-fg-3">
                No incidents {selectedNode ? 'on this node' : 'yet'}.
              </p>
            ) : (
              recent.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  now={now}
                  onSelect={(id) => dispatch(uiActions.openDetail(id))}
                />
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel lit>
          <PanelHeader eyebrow="From the durable activity log" title="Activity timeline" />
          <div className="p-4">
            <ActivityTimeline />
          </div>
        </Panel>
        <Panel lit>
          <PanelHeader eyebrow="Real transitions, not a mock" title="Connection timeline" />
          <div className="p-4">
            <ConnectionTimeline />
          </div>
        </Panel>
        <Panel lit>
          <PanelHeader eyebrow="Open incidents" title="Severity by sector" />
          <div className="p-4">
            <Suspense fallback={<Skeleton className="h-56 w-full" />}>
              {incidents ? (
                <SeverityChart incidents={incidents} />
              ) : (
                <Skeleton className="h-56 w-full" />
              )}
            </Suspense>
          </div>
        </Panel>
      </div>
    </PageContainer>
  );
}
