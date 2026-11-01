import { describe, expect, it } from 'vitest';
import {
  createIncidentBodySchema,
  diffIncidentFields,
  incidentCode,
  updateIncidentBodySchema,
} from './incident';
import { createRng, generateIncidentFields } from './seed';
import { LINKS, NODES, NODES_BY_ID, SECTORS, nodeIdForIncident } from './topology';

function inside(
  [x, y]: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('topology', () => {
  it('places every node inside its own sector polygon', () => {
    for (const node of NODES) {
      const sector = SECTORS.find((s) => s.id === node.sectorId)!;
      expect(inside([node.x, node.y], sector.polygon), node.id).toBe(true);
    }
  });

  it('only links existing nodes, with unique ids', () => {
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODES.length);
    for (const link of LINKS) {
      expect(NODES_BY_ID[link.from]).toBeDefined();
      expect(NODES_BY_ID[link.to]).toBeDefined();
    }
  });

  it('attaches incidents to a stable node in their sector', () => {
    const id = '1b2c3d4e-0000-4000-8000-000000000000';
    expect(nodeIdForIncident({ id, sectorId: 's06' })).toBe(
      nodeIdForIncident({ id, sectorId: 's06' }),
    );
    expect(NODES_BY_ID[nodeIdForIncident({ id, sectorId: 's06' })]!.sectorId).toBe('s06');
  });
});

describe('schemas', () => {
  it('validates create and update bodies', () => {
    const valid = {
      id: crypto.randomUUID(),
      title: 'Pump vibration',
      description: '',
      severity: 'low',
      status: 'open',
      sectorId: 's01',
      assignedTo: null,
    };
    expect(createIncidentBodySchema.safeParse(valid).success).toBe(true);
    expect(createIncidentBodySchema.safeParse({ ...valid, sectorId: 's99' }).success).toBe(false);
    expect(updateIncidentBodySchema.safeParse({ baseVersion: 2, changes: {} }).success).toBe(false);
    expect(
      updateIncidentBodySchema.safeParse({ baseVersion: 0, changes: { title: 'Valid' } }).success,
    ).toBe(false);
  });

  it('derives codes and field diffs', () => {
    expect(incidentCode('3f9a1c00-0000-4000-8000-000000000000')).toBe('INC-3F9A');
    const a = {
      title: 'A',
      description: '',
      severity: 'low',
      status: 'open',
      sectorId: 's01',
      assignedTo: null,
    } as const;
    expect(diffIncidentFields(a, { ...a, status: 'resolved', assignedTo: 'X' })).toEqual([
      'status',
      'assignedTo',
    ]);
  });
});

describe('deterministic generators', () => {
  it('repeats for the same seed', () => {
    const a = createRng(9);
    const b = createRng(9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(generateIncidentFields(3, 20)).toEqual(generateIncidentFields(3, 20));
  });
});
