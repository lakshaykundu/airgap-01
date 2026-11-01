import type { IncidentFields, IncidentSeverity, IncidentStatus } from './incident';
import { OPERATORS, SECTOR_IDS, type SectorId } from './topology';

/** Small, fast, seedable PRNG (mulberry32). Deterministic across platforms. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

const TITLES = [
  'Relay heartbeat lost',
  'Cooling loop pressure drop',
  'Uplink packet loss above threshold',
  'Substation voltage sag',
  'Pump vibration anomaly',
  'Fiber trunk latency spike',
  'Battery bank thermal drift',
  'Firmware rollout stalled',
  'Backup generator failed self-test',
  'Access gate controller offline',
  'Sensor array calibration drift',
  'Telemetry gap detected',
  'Switchgear breaker trip',
  'Water ingress alarm',
  'Clock sync deviation',
  'Spare capacity below reserve',
] as const;

const DETAILS = [
  'Automated monitors flagged the condition during the last polling window.',
  'Field crew reported intermittent behaviour; remote diagnostics are inconclusive.',
  'Readings exceed the configured threshold for more than five minutes.',
  'Redundant path is carrying load; failover margin is reduced.',
  'Condition correlates with maintenance activity earlier in the shift.',
  'Downstream consumers have not reported impact yet.',
] as const;

const SEVERITY_WEIGHTS: [IncidentSeverity, number][] = [
  ['low', 0.3],
  ['medium', 0.32],
  ['high', 0.24],
  ['critical', 0.14],
];

const STATUS_WEIGHTS: [IncidentStatus, number][] = [
  ['open', 0.42],
  ['investigating', 0.33],
  ['resolved', 0.25],
];

function weighted<T>(rng: () => number, weights: [T, number][]): T {
  let roll = rng();
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1]![0];
}

export interface GeneratedIncident extends IncidentFields {
  /** Minutes before the reference time when the incident was created. */
  ageMinutes: number;
  /** Minutes between creation and last update. */
  updatedAfterMinutes: number;
}

/** Deterministic fictional incident content. Used by the server seed and the load test. */
export function generateIncidentFields(seed: number, count: number): GeneratedIncident[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => {
    const sectorId: SectorId = pick(rng, SECTOR_IDS);
    const title = pick(rng, TITLES);
    const ageMinutes = Math.floor(rng() * 60 * 24 * 6) + 5;
    return {
      title,
      description: `${pick(rng, DETAILS)} ${pick(rng, DETAILS)}`,
      severity: weighted(rng, SEVERITY_WEIGHTS),
      status: weighted(rng, STATUS_WEIGHTS),
      sectorId,
      assignedTo: rng() < 0.8 ? pick(rng, OPERATORS) : null,
      ageMinutes,
      updatedAfterMinutes: Math.floor(rng() * Math.min(ageMinutes, 240)),
    };
  });
}
