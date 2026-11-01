import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
} from '../../store/filtersSlice';
import { applyIncidentFilters, matchesSearch, type FilterableIncident } from './filtering';

const make = (overrides: Partial<FilterableIncident>): FilterableIncident => ({
  id: '3f9a0000-0000-4000-8000-000000000000',
  title: 'Relay heartbeat lost',
  description: 'Northern relay stopped responding',
  severity: 'low',
  status: 'open',
  sectorId: 's01',
  assignedTo: 'A. Rao',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  syncStatus: 'synced',
  ...overrides,
});

const incidents = [
  make({
    id: 'a1000000-0000-4000-8000-000000000000',
    title: 'Alpha pump vibration',
    severity: 'critical',
    updatedAt: '2026-01-03T00:00:00Z',
    sectorId: 's07',
  }),
  make({
    id: 'b2000000-0000-4000-8000-000000000000',
    title: 'Bravo fiber latency',
    severity: 'medium',
    status: 'resolved',
    updatedAt: '2026-01-02T00:00:00Z',
    assignedTo: 'M. Chen',
  }),
  make({
    id: 'c3000000-0000-4000-8000-000000000000',
    title: 'Charlie gate offline',
    severity: 'high',
    syncStatus: 'pending',
    updatedAt: '2026-01-04T00:00:00Z',
  }),
];

describe('search', () => {
  it('matches incident code, title, description, sector name and operator', () => {
    const target = incidents[1]!;
    expect(matchesSearch(target, 'INC-B200')).toBe(true);
    expect(matchesSearch(target, 'fiber')).toBe(true);
    expect(matchesSearch(target, 'northern relay')).toBe(true); // description, multi-term
    expect(matchesSearch(incidents[0]!, 'ridge array')).toBe(true); // sector s07 name
    expect(matchesSearch(target, 'chen')).toBe(true);
    expect(matchesSearch(target, 'okafor')).toBe(false);
  });
});

describe('filters and sorting', () => {
  it('combines filters with AND semantics', () => {
    const result = applyIncidentFilters(incidents, {
      ...EMPTY_FILTERS,
      status: ['open'],
      severity: ['critical', 'high'],
    });
    expect(result.map((i) => i.title)).toEqual(['Charlie gate offline', 'Alpha pump vibration']);
    expect(applyIncidentFilters(incidents, { ...EMPTY_FILTERS, sync: ['pending'] })).toHaveLength(
      1,
    );
  });

  it('sorts by recency, age, severity and title without mutating input', () => {
    const titles = (sort: typeof EMPTY_FILTERS.sort) =>
      applyIncidentFilters(incidents, { ...EMPTY_FILTERS, sort }).map((i) => i.title[0]);
    expect(titles('recent')).toEqual(['C', 'A', 'B']);
    expect(titles('oldest')).toEqual(['B', 'A', 'C']);
    expect(titles('severity')).toEqual(['A', 'C', 'B']);
    expect(titles('title')).toEqual(['A', 'B', 'C']);
    expect(incidents[0]!.title).toBe('Alpha pump vibration');
  });
});

describe('URL round trip', () => {
  it('restores filters from a shared URL and drops unknown values', () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams('severity=critical,bogus&status=open&sort=severity&q=pump'),
    );
    expect(filters).toMatchObject({
      severity: ['critical'],
      status: ['open'],
      sort: 'severity',
      search: 'pump',
    });
    expect(filtersToSearchParams(filters).toString()).toBe(
      'q=pump&status=open&severity=critical&sort=severity',
    );
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe('');
  });
});
