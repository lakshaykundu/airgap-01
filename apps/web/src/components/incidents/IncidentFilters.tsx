import { SECTORS, SEVERITIES, STATUSES, SYNC_STATUSES } from '@airgap/shared';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Popover } from 'radix-ui';
import { activeFilterCount } from '../../features/incidents/filtering';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  filtersActions,
  SORT_OPTIONS,
  type IncidentFilters,
  type SortOption,
} from '../../store/filtersSlice';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';

type ListKey = 'status' | 'severity' | 'sector' | 'sync';

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Most recent',
  oldest: 'Oldest',
  severity: 'Severity',
  title: 'Title A–Z',
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 rounded-md border px-2 font-mono text-[10.5px] uppercase tracking-wider transition-colors',
        active
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-line text-fg-3 hover:border-[#2f4260] hover:text-fg-2',
      )}
    >
      {children}
    </button>
  );
}

export function FilterGroups({
  filters,
  onToggle,
  include = ['status', 'severity', 'sector', 'sync'],
}: {
  filters: IncidentFilters;
  onToggle: (key: ListKey, value: string) => void;
  include?: ListKey[];
}) {
  const groups: {
    key: ListKey;
    label: string;
    values: readonly { value: string; label: string }[];
  }[] = [
    { key: 'status', label: 'Status', values: STATUSES.map((v) => ({ value: v, label: v })) },
    { key: 'severity', label: 'Severity', values: SEVERITIES.map((v) => ({ value: v, label: v })) },
    {
      key: 'sector',
      label: 'Sector',
      values: SECTORS.map((s) => ({ value: s.id, label: s.code.replace('SECTOR ', 'S') })),
    },
    { key: 'sync', label: 'Sync', values: SYNC_STATUSES.map((v) => ({ value: v, label: v })) },
  ];
  return (
    <div className="space-y-3">
      {groups
        .filter((group) => include.includes(group.key))
        .map((group) => (
          <fieldset key={group.key}>
            <legend className="label-xs mb-1.5">{group.label}</legend>
            <div className="flex flex-wrap gap-1.5">
              {group.values.map((option) => (
                <Chip
                  key={option.value}
                  active={(filters[group.key] as string[]).includes(option.value)}
                  onClick={() => onToggle(group.key, option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        ))}
    </div>
  );
}

export function IncidentFiltersBar({ resultCount, total }: { resultCount: number; total: number }) {
  const filters = useAppSelector((state) => state.filters);
  const dispatch = useAppDispatch();
  const count = activeFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search incidents"
          placeholder="Search ID, title, description, sector, operator…"
          value={filters.search}
          onChange={(e) => dispatch(filtersActions.setSearch(e.target.value))}
          className="pl-9"
          data-testid="incident-search"
        />
      </div>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="secondary"
            size="md"
            aria-label={`Filters${count ? `, ${count} active` : ''}`}
            data-testid="filters-button"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {count > 0 && (
              <span className="rounded bg-primary/15 px-1.5 font-mono text-[10px] text-primary">
                {count}
              </span>
            )}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="panel z-50 w-[min(420px,calc(100vw-2rem))] bg-elevated/95 p-4 data-[state=open]:animate-scale-in"
          >
            <FilterGroups
              filters={filters}
              onToggle={(key, value) => dispatch(filtersActions.toggleValue({ key, value }))}
            />
            <div className="mt-4 flex justify-between border-t border-line/70 pt-3">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => dispatch(filtersActions.clearFilters())}
              >
                <X className="h-3 w-3" /> Clear all
              </Button>
              <Popover.Close asChild>
                <Button size="xs" variant="primary" mono>
                  Done
                </Button>
              </Popover.Close>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Select
        aria-label="Sort incidents"
        value={filters.sort}
        onChange={(e) => dispatch(filtersActions.setSort(e.target.value as SortOption))}
        className="w-auto min-w-36"
        data-testid="incident-sort"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {SORT_LABELS[option]}
          </option>
        ))}
      </Select>
      <p
        className="w-full font-mono text-[11px] text-fg-3 sm:w-auto"
        aria-live="polite"
        data-testid="incident-result-count"
      >
        {resultCount} / {total} shown
      </p>
    </div>
  );
}
