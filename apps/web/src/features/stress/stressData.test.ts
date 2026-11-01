import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AirgapDatabase } from '../../database/db';
import { EMPTY_FILTERS } from '../../store/filtersSlice';
import { generateStressRecords, queryStressRecords, seedStressDataset } from './stressData';

let db: AirgapDatabase;
beforeEach(() => {
  db = new AirgapDatabase(`stress-${crypto.randomUUID()}`);
});
afterEach(() => db.delete());

describe('load-test dataset', () => {
  it('is deterministic', () => {
    expect(generateStressRecords(50)).toEqual(generateStressRecords(50));
    expect(new Set(generateStressRecords().map((r) => r.id)).size).toBe(1000);
  });

  it('uses an index for selective filters and agrees with a brute-force filter', async () => {
    await seedStressDataset(db);
    const filters = {
      ...EMPTY_FILTERS,
      severity: ['critical' as const],
      status: ['open' as const],
      search: 'relay',
    };
    const result = await queryStressRecords(db, filters);
    const expected = generateStressRecords().filter(
      (r) => r.severity === 'critical' && r.status === 'open' && r.search.includes('relay'),
    );
    expect(result.strategy).toContain('index: severity');
    expect(result.records.map((r) => r.id).sort()).toEqual(expected.map((r) => r.id).sort());
    expect(result.queryMs).toBeGreaterThanOrEqual(0);
  });
});
