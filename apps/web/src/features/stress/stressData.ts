import {
  SEVERITY_RANK,
  generateIncidentFields,
  nodeIdForIncident,
  sectorLabel,
} from '@airgap/shared';
import type { AirgapDatabase, StressRecord } from '../../database/db';
import type { IncidentFilters } from '../../store/filtersSlice';
import { compareIncidents } from '../incidents/filtering';

export const STRESS_SEED = 1000;
export const STRESS_COUNT = 1000;
const REFERENCE_TIME = Date.UTC(2026, 0, 15, 12, 0, 0);

/** 1,000 deterministic fictional records: same seed → identical dataset everywhere. */
export function generateStressRecords(count = STRESS_COUNT, seed = STRESS_SEED): StressRecord[] {
  return generateIncidentFields(seed, count).map((fields, index) => {
    const id = `lt-${String(index + 1).padStart(4, '0')}`;
    const createdAt = new Date(REFERENCE_TIME - fields.ageMinutes * 60_000);
    const updatedAt = new Date(createdAt.getTime() + fields.updatedAfterMinutes * 60_000);
    const record: StressRecord = {
      id,
      title: fields.title,
      description: fields.description,
      severity: fields.severity,
      status: fields.status,
      sectorId: fields.sectorId,
      nodeId: nodeIdForIncident({ id, sectorId: fields.sectorId }),
      assignedTo: fields.assignedTo,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      search: '',
    };
    record.search = [
      id,
      fields.title,
      fields.description,
      sectorLabel(fields.sectorId),
      fields.assignedTo ?? '',
    ]
      .join('\n')
      .toLowerCase();
    return record;
  });
}

export async function seedStressDataset(
  db: AirgapDatabase,
): Promise<{ count: number; durationMs: number }> {
  const started = performance.now();
  const records = generateStressRecords();
  await db.transaction('rw', db.stressTestRecords, async () => {
    await db.stressTestRecords.clear();
    await db.stressTestRecords.bulkPut(records);
  });
  return { count: records.length, durationMs: performance.now() - started };
}

export interface StressQueryResult {
  records: StressRecord[];
  queryMs: number;
  filterMs: number;
  strategy: string;
}

/**
 * Narrows with an IndexedDB index when a single indexed filter is active
 * (cheapest selective read), then applies the remaining predicates in memory.
 * Both phases are timed with performance.now().
 */
export async function queryStressRecords(
  db: AirgapDatabase,
  filters: IncidentFilters,
): Promise<StressQueryResult> {
  const queryStart = performance.now();
  let strategy: string;
  let candidates: StressRecord[];
  if (filters.severity.length > 0) {
    strategy = `index: severity anyOf(${filters.severity.join(', ')})`;
    candidates = await db.stressTestRecords.where('severity').anyOf(filters.severity).toArray();
  } else if (filters.status.length > 0) {
    strategy = `index: status anyOf(${filters.status.join(', ')})`;
    candidates = await db.stressTestRecords.where('status').anyOf(filters.status).toArray();
  } else if (filters.sector.length > 0) {
    strategy = `index: sectorId anyOf(${filters.sector.join(', ')})`;
    candidates = await db.stressTestRecords.where('sectorId').anyOf(filters.sector).toArray();
  } else {
    strategy = 'full scan (no indexed filter active)';
    candidates = await db.stressTestRecords.toArray();
  }
  const queryMs = performance.now() - queryStart;

  const filterStart = performance.now();
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const records = candidates
    .filter(
      (r) =>
        (!filters.status.length || filters.status.includes(r.status)) &&
        (!filters.severity.length || filters.severity.includes(r.severity)) &&
        (!filters.sector.length || filters.sector.includes(r.sectorId as never)) &&
        terms.every((term) => r.search.includes(term)),
    )
    .sort(compareIncidents(filters.sort));
  const filterMs = performance.now() - filterStart;
  return { records, queryMs, filterMs, strategy };
}

export function severityCounts(records: StressRecord[]): Record<string, number> {
  const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of records) counts[r.severity] = (counts[r.severity] ?? 0) + 1;
  return counts;
}

export { SEVERITY_RANK };
