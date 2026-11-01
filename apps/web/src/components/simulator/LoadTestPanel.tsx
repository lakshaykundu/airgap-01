import { incidentCode, sectorLabel } from '@airgap/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Database, Gauge, Map as MapIcon, Search, Trash2, Zap } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useRuntime } from '../../app/RuntimeContext';
import type { StressRecord } from '../../database/db';
import { queryStressRecords, seedStressDataset } from '../../features/stress/stressData';
import { useStressCount } from '../../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../../store';
import { EMPTY_FILTERS, type IncidentFilters, type SortOption } from '../../store/filtersSlice';
import { perfActions } from '../../store/perfSlice';
import { cn } from '../../utils/cn';
import { formatMs } from '../../utils/format';
import { FilterGroups } from '../incidents/IncidentFilters';
import { SeverityBadge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { EmptyState } from '../ui/States';

const ROW_HEIGHT = 44;

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bg/40 px-3 py-2">
      <dt className="label-xs">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-fg tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-[10px] text-fg-3">{hint}</p>}
    </div>
  );
}

/**
 * LOAD TEST / 1000. A separate local dataset (never queued for sync). Querying
 * uses IndexedDB indexes where a selective filter exists; the list is
 * virtualized; every metric shown is measured with performance.now().
 */
export function LoadTestPanel() {
  const runtime = useRuntime();
  const dispatch = useAppDispatch();
  const count = useStressCount() ?? 0;
  const perf = useAppSelector((state) => state.perf);
  const lastSyncMs = useAppSelector((state) => state.connectivity.sync.lastDurationMs);
  const [filters, setFilters] = useState<IncidentFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  // Debounce typing only for the query; the input itself stays instant.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [records, setRecords] = useState<StressRecord[]>([]);
  const [selected, setSelected] = useState<StressRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput), 120);
    return () => clearTimeout(id);
  }, [searchInput]);

  const effective = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );
  const deferred = useDeferredValue(effective);

  useEffect(() => {
    let cancelled = false;
    if (count === 0) {
      setRecords([]);
      return;
    }
    performance.mark('airgap-stress-query-start');
    void queryStressRecords(runtime.db, deferred).then((result) => {
      if (cancelled) return;
      performance.mark('airgap-stress-query-end');
      performance.measure(
        'airgap-stress-query',
        'airgap-stress-query-start',
        'airgap-stress-query-end',
      );
      setRecords(result.records);
      dispatch(
        perfActions.recordMetrics({
          datasetSize: count,
          queryMs: result.queryMs,
          filterMs: result.filterMs,
          visibleRecords: result.records.length,
          queryStrategy: result.strategy,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [deferred, count, runtime.db, dispatch]);

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
    getItemKey: (index) => records[index]!.id,
  });
  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    dispatch(perfActions.recordMetrics({ renderedRows: items.length }));
  }, [items.length, dispatch]);

  async function generate() {
    setBusy(true);
    const { count: generated, durationMs } = await seedStressDataset(runtime.db);
    dispatch(perfActions.recordMetrics({ datasetSize: generated, generateMs: durationMs }));
    setBusy(false);
  }

  async function reset() {
    await runtime.db.stressTestRecords.clear();
    setSelected(null);
    dispatch(perfActions.resetMetrics());
  }

  const toggle = (key: 'status' | 'severity' | 'sector' | 'sync', value: string) =>
    setFilters((current) => {
      const list = current[key] as string[];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="load-test">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            mono
            onClick={() => void generate()}
            disabled={busy}
            data-testid="generate-records"
          >
            <Zap className="h-4 w-4" />{' '}
            {count > 0 ? 'Regenerate 1,000 records' : 'Generate 1,000 records'}
          </Button>
          <Button
            variant="secondary"
            mono
            onClick={() => void reset()}
            disabled={count === 0}
            data-testid="reset-dataset"
          >
            <Trash2 className="h-4 w-4" /> Reset dataset
          </Button>
          <Link
            to="/map"
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg px-3 font-mono text-[11px] tracking-wider text-fg-2 uppercase hover:bg-hover hover:text-fg"
          >
            <MapIcon className="h-3.5 w-3.5" /> Inspect on map
          </Link>
        </div>
        {count === 0 ? (
          <div className="rounded-xl border border-dashed border-line">
            <EmptyState
              icon={<Database className="h-6 w-6" />}
              title="No load-test data"
              description="Generate 1,000 deterministic fictional records in a separate IndexedDB table. They are never sent to the server."
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3"
                  aria-hidden
                />
                <Input
                  type="search"
                  aria-label="Search load-test records"
                  placeholder="Search 1,000 records…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                  data-testid="stress-search"
                />
              </div>
              <Select
                aria-label="Sort load-test records"
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortOption })}
                className="w-auto"
                data-testid="stress-sort"
              >
                <option value="recent">Most recent</option>
                <option value="oldest">Oldest</option>
                <option value="severity">Severity</option>
                <option value="title">Title A–Z</option>
              </Select>
            </div>
            <div
              className="rounded-xl border border-line/70 bg-bg/30 p-3"
              data-testid="stress-filters"
            >
              <FilterGroups
                filters={filters}
                onToggle={toggle}
                include={['severity', 'status', 'sector']}
              />
            </div>
            <p
              className="font-mono text-[11px] text-fg-3"
              data-testid="stress-result-count"
              aria-live="polite"
            >
              {records.length} matching · {items.length} rows mounted
            </p>
            <div
              ref={parentRef}
              className="h-[420px] overflow-y-auto rounded-xl border border-line/70"
              data-testid="stress-list"
              role="list"
              aria-label="Load-test records"
            >
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {items.map((item) => {
                  const record = records[item.index]!;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="listitem"
                      onClick={() => setSelected(record)}
                      data-testid="stress-row"
                      data-severity={record.severity}
                      className={cn(
                        'absolute left-0 grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line/40 px-3 text-left text-[13px] hover:bg-hover/40 sm:grid-cols-[72px_minmax(0,1fr)_90px_110px]',
                        selected?.id === record.id && 'bg-primary/[0.06]',
                      )}
                      style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
                    >
                      <span className="font-mono text-[11px] text-fg-3">
                        {incidentCode(record.id)}
                      </span>
                      <span className="truncate text-fg">{record.title}</span>
                      <SeverityBadge severity={record.severity} />
                      <span className="hidden sm:block">
                        <StatusBadge status={record.status} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border border-line/70 bg-bg/30 p-3">
          <p className="label-xs mb-2 flex items-center gap-1.5">
            <Gauge className="h-3 w-3" /> Performance panel
          </p>
          <dl className="grid grid-cols-2 gap-2" data-testid="perf-panel">
            <Metric label="Dataset size" value={count.toLocaleString()} />
            <Metric label="Generate + write" value={formatMs(perf.generateMs)} />
            <Metric label="IndexedDB query" value={formatMs(perf.queryMs)} />
            <Metric label="Filter + sort" value={formatMs(perf.filterMs)} />
            <Metric
              label="Rendered rows"
              value={<span data-testid="rendered-rows">{perf.renderedRows ?? '—'}</span>}
            />
            <Metric label="Visible records" value={perf.visibleRecords ?? '—'} />
            <Metric
              label="Last sync run"
              value={formatMs(lastSyncMs, 0)}
              hint="Real incidents, not load test"
            />
          </dl>
          {perf.queryStrategy && (
            <p className="mt-2 font-mono text-[10.5px] text-fg-3">Strategy: {perf.queryStrategy}</p>
          )}
          <p className="mt-2 text-[10.5px] leading-relaxed text-fg-3">
            Measured in this browser with performance.now() (also visible as `airgap-stress-query`
            in the Performance panel). Values depend on hardware; no FPS or synthetic numbers are
            shown.
          </p>
        </div>
        {selected && (
          <div
            className="rounded-xl border border-line/70 bg-bg/30 p-3"
            data-testid="stress-detail"
          >
            <p className="font-mono text-[11px] text-fg-3">
              {incidentCode(selected.id)} · node {selected.nodeId}
            </p>
            <p className="mt-1 text-sm font-medium">{selected.title}</p>
            <div className="mt-2 flex gap-1.5">
              <SeverityBadge severity={selected.severity} />
              <StatusBadge status={selected.status} />
            </div>
            <p className="mt-2 text-xs text-fg-2">{selected.description}</p>
            <p className="mt-2 text-[11px] text-fg-3">
              {sectorLabel(selected.sectorId)} · {selected.assignedTo ?? 'Unassigned'}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
