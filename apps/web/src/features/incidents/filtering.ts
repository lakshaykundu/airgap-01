import { SEVERITY_RANK, incidentCode, sectorLabel, type IncidentSeverity } from '@airgap/shared';
import type { IncidentFilters, SortOption } from '../../store/filtersSlice';

export interface FilterableIncident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: string;
  sectorId: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus?: string;
}

/** Case-insensitive match on id/code, title, description, sector and operator. */
export function matchesSearch(incident: FilterableIncident, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    incident.id,
    incidentCode(incident.id),
    incident.title,
    incident.description,
    incident.sectorId,
    sectorLabel(incident.sectorId),
    incident.assignedTo ?? '',
  ]
    .join('\n')
    .toLowerCase();
  return needle.split(/\s+/).every((term) => haystack.includes(term));
}

export function matchesFilters(incident: FilterableIncident, filters: IncidentFilters): boolean {
  if (filters.status.length && !filters.status.includes(incident.status as never)) return false;
  if (filters.severity.length && !filters.severity.includes(incident.severity)) return false;
  if (filters.sector.length && !filters.sector.includes(incident.sectorId as never)) return false;
  if (filters.sync.length && !filters.sync.includes((incident.syncStatus ?? 'synced') as never))
    return false;
  return matchesSearch(incident, filters.search);
}

export function compareIncidents(sort: SortOption) {
  return (a: FilterableIncident, b: FilterableIncident): number => {
    switch (sort) {
      case 'oldest':
        return a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
      case 'severity':
        return (
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          b.updatedAt.localeCompare(a.updatedAt)
        );
      case 'title':
        return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
      case 'recent':
      default:
        return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
    }
  };
}

/** Pure filter + sort pipeline; never mutates its input. */
export function applyIncidentFilters<T extends FilterableIncident>(
  incidents: readonly T[],
  filters: IncidentFilters,
): T[] {
  return incidents
    .filter((incident) => matchesFilters(incident, filters))
    .sort(compareIncidents(filters.sort));
}

export function activeFilterCount(filters: IncidentFilters): number {
  return (
    filters.status.length +
    filters.severity.length +
    filters.sector.length +
    filters.sync.length +
    (filters.search.trim() ? 1 : 0)
  );
}
