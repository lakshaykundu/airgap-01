import { NODES, nodeIdForIncident } from '@airgap/shared';
import { describe, expect, it } from 'vitest';
import { summarizeNodes, type MapIncident } from './mapModel';

describe('summarizeNodes', () => {
  const base: Omit<MapIncident, 'id'> = {
    sectorId: 's02',
    severity: 'low',
    status: 'open',
    syncStatus: 'synced',
  };
  const node = nodeIdForIncident({ id: 'x-1', sectorId: 's02' });

  it('always returns one summary per node (clustering) and attaches incidents deterministically', () => {
    const summaries = summarizeNodes([{ ...base, id: 'x-1' }]);
    expect(summaries.size).toBe(NODES.length);
    expect(summaries.get(node)!.incidentIds).toEqual(['x-1']);
  });

  it('applies status precedence pending > critical > warning > operational', () => {
    const at = (incidents: MapIncident[]) => summarizeNodes(incidents).get(node)!.status;
    expect(at([])).toBe('operational');
    expect(at([{ ...base, id: 'x-1' }])).toBe('warning');
    expect(at([{ ...base, id: 'x-1', severity: 'high' }])).toBe('critical');
    expect(at([{ ...base, id: 'x-1', severity: 'critical', status: 'resolved' }])).toBe(
      'operational',
    );
    expect(at([{ ...base, id: 'x-1', severity: 'critical', syncStatus: 'pending' }])).toBe(
      'pending',
    );
  });
});
