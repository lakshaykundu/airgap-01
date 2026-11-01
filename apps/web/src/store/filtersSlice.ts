import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  SECTOR_IDS,
  SEVERITIES,
  STATUSES,
  SYNC_STATUSES,
  type IncidentSeverity,
  type IncidentStatus,
  type SectorId,
  type SyncStatus,
} from '@airgap/shared';

export const SORT_OPTIONS = ['recent', 'oldest', 'severity', 'title'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface IncidentFilters {
  search: string;
  status: IncidentStatus[];
  severity: IncidentSeverity[];
  sector: SectorId[];
  sync: SyncStatus[];
  sort: SortOption;
}

export const EMPTY_FILTERS: IncidentFilters = {
  search: '',
  status: [],
  severity: [],
  sector: [],
  sync: [],
  sort: 'recent',
};

function parseList<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return value
    .split(',')
    .filter((item): item is T => (allowed as readonly string[]).includes(item));
}

/** URL → filters. Unknown values are dropped so shared links can't break the view. */
export function filtersFromSearchParams(params: URLSearchParams): IncidentFilters {
  const sort = params.get('sort');
  return {
    search: (params.get('q') ?? '').slice(0, 120),
    status: parseList(params.get('status'), STATUSES),
    severity: parseList(params.get('severity'), SEVERITIES),
    sector: parseList(params.get('sector'), SECTOR_IDS),
    sync: parseList(params.get('sync'), SYNC_STATUSES),
    sort: (SORT_OPTIONS as readonly string[]).includes(sort ?? '')
      ? (sort as SortOption)
      : 'recent',
  };
}

/** Filters → URL. Defaults are omitted to keep links short. */
export function filtersToSearchParams(filters: IncidentFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.status.length) params.set('status', filters.status.join(','));
  if (filters.severity.length) params.set('severity', filters.severity.join(','));
  if (filters.sector.length) params.set('sector', filters.sector.join(','));
  if (filters.sync.length) params.set('sync', filters.sync.join(','));
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  return params;
}

type ListKey = 'status' | 'severity' | 'sector' | 'sync';

const filtersSlice = createSlice({
  name: 'filters',
  initialState: EMPTY_FILTERS,
  reducers: {
    replaceFilters: (_state, action: PayloadAction<IncidentFilters>) => action.payload,
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
    },
    setSort(state, action: PayloadAction<SortOption>) {
      state.sort = action.payload;
    },
    toggleValue(state, action: PayloadAction<{ key: ListKey; value: string }>) {
      const list = state[action.payload.key] as string[];
      const index = list.indexOf(action.payload.value);
      if (index >= 0) list.splice(index, 1);
      else list.push(action.payload.value);
    },
    clearFilters: () => EMPTY_FILTERS,
  },
});

export const filtersActions = filtersSlice.actions;
export default filtersSlice.reducer;
