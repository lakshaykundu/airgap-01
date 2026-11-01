import { SECTORS, incidentCode, sectorLabel } from '@airgap/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useRuntime } from '../app/RuntimeContext';
import type { StressRecord } from '../database/db';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { MapLegend, OperationsMap } from '../components/map/OperationsMap';
import {
  NODE_COLORS,
  NODE_STATUSES,
  summarizeNodes,
  type MapIncident,
  type NodeStatus,
} from '../components/map/mapModel';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { SegmentedControl } from '../components/ui/States';
import { useIncidents, useStressCount } from '../hooks/useLiveData';
import { useAppDispatch } from '../store';
import { uiActions } from '../store/uiSlice';

export default function MapPage() {
  const runtime = useRuntime();
  const incidents = useIncidents();
  const stressCount = useStressCount() ?? 0;
  const [dataset, setDataset] = useState<'live' | 'stress'>('live');
  const stress = useLiveQuery(
    async (): Promise<StressRecord[]> =>
      dataset === 'stress' ? runtime.db.stressTestRecords.toArray() : [],
    [dataset, runtime.db],
  );
  const [visible, setVisible] = useState<NodeStatus[]>(NODE_STATUSES);
  const [selected, setSelected] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  const records: MapIncident[] = useMemo(
    () => (dataset === 'live' ? (incidents ?? []) : (stress ?? [])),
    [dataset, incidents, stress],
  );
  const summaries = useMemo(() => summarizeNodes(records), [records]);
  const selectedSummary = selected ? summaries.get(selected) : undefined;
  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const selectedRecords = (selectedSummary?.incidentIds ?? [])
    .map((id) => byId.get(id)!)
    .filter(Boolean);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Fictional topology · bundled offline"
        title="Operations Map"
        description="A custom SVG map with zoom, pan and keyboard navigation. No external tiles: it renders identically with no network."
        actions={
          <SegmentedControl
            label="Map dataset"
            value={dataset}
            onChange={(value) => {
              setDataset(value);
              setSelected(null);
            }}
            options={[
              { value: 'live', label: `Live (${incidents?.length ?? 0})` },
              { value: 'stress', label: `Load test (${stressCount})` },
            ]}
          />
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel lit className="p-3">
          <OperationsMap
            incidents={records}
            visibleStatuses={visible}
            selectedNodeId={selected}
            onSelectNode={setSelected}
            className="aspect-[1000/640] w-full"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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
            <p className="font-mono text-[10.5px] text-fg-3">
              {records.length} records clustered onto 32 nodes
              {dataset === 'stress' &&
                stressCount === 0 &&
                ' · generate the dataset in the Chaos Lab'}
            </p>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel lit>
            <PanelHeader
              eyebrow="Node inspector"
              title={selectedSummary ? selectedSummary.node.name : 'Select a node'}
            />
            <div className="p-4">
              {!selectedSummary ? (
                <p className="text-sm text-fg-3">
                  Click a marker, or use the node list below (keyboard accessible), to inspect it
                  and highlight related incidents.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="font-mono text-[11px] tracking-wider text-fg-2 uppercase">
                    <span style={{ color: NODE_COLORS[selectedSummary.status] }}>
                      {selectedSummary.status}
                    </span>{' '}
                    · {sectorLabel(selectedSummary.node.sectorId)} · {selectedSummary.node.kind}
                  </p>
                  <p className="text-sm text-fg-2">
                    {selectedSummary.openCount} open / {selectedSummary.incidentIds.length} total
                    incidents
                    {selectedSummary.pendingCount > 0 &&
                      ` · ${selectedSummary.pendingCount} with unsynced local changes`}
                  </p>
                  <ul className="max-h-72 space-y-1 overflow-y-auto" data-testid="node-incidents">
                    {selectedRecords.slice(0, 100).map((record) => (
                      <li key={record.id}>
                        {dataset === 'live' ? (
                          <button
                            type="button"
                            onClick={() => dispatch(uiActions.openDetail(record.id))}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-hover"
                          >
                            <span className="font-mono text-[10.5px] text-fg-3">
                              {incidentCode(record.id)}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{record.title}</span>
                            <SeverityBadge severity={record.severity} />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-2 py-1 text-sm">
                            <span className="font-mono text-[10.5px] text-fg-3">
                              {incidentCode(record.id)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-fg-2">
                              {record.title}
                            </span>
                            <StatusBadge status={record.status as never} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {dataset === 'live' && (
                    <Link
                      to={`/incidents?sector=${selectedSummary.node.sectorId}`}
                      className="inline-block font-mono text-[11px] tracking-wider text-primary uppercase hover:underline"
                    >
                      Open sector in explorer →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel lit>
            <PanelHeader
              eyebrow="Keyboard alternative"
              title="Node list"
              actions={<Layers className="h-4 w-4 text-fg-3" />}
            />
            <div className="max-h-[420px] overflow-y-auto p-2">
              {SECTORS.map((sector) => (
                <div key={sector.id} className="mb-2">
                  <p className="label-xs px-2 py-1">
                    {sector.code} · {sector.name}
                  </p>
                  <ul>
                    {[...summaries.values()]
                      .filter((s) => s.node.sectorId === sector.id && visible.includes(s.status))
                      .map((summary) => (
                        <li key={summary.node.id}>
                          <button
                            type="button"
                            aria-pressed={selected === summary.node.id}
                            onClick={() => setSelected(summary.node.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-fg aria-pressed:bg-elevated aria-pressed:text-fg"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: NODE_COLORS[summary.status] }}
                              aria-hidden
                            />
                            <span className="flex-1 truncate">{summary.node.name}</span>
                            <span className="font-mono text-[10.5px] text-fg-3">
                              {summary.openCount} open
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}
