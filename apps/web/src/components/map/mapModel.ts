import {
  NODES,
  SEVERITY_RANK,
  nodeIdForIncident,
  type IncidentSeverity,
  type InfraNode,
} from '@airgap/shared';

export type NodeStatus = 'operational' | 'warning' | 'critical' | 'pending';
export const NODE_STATUSES: NodeStatus[] = ['operational', 'warning', 'critical', 'pending'];

export const NODE_COLORS: Record<NodeStatus, string> = {
  operational: '#27d6a1',
  warning: '#ffbb55',
  critical: '#ff5364',
  pending: '#9275ff',
};

export interface MapIncident {
  id: string;
  title?: string;
  sectorId: string;
  severity: IncidentSeverity;
  status: string;
  syncStatus?: string;
  nodeId?: string;
}

export interface NodeSummary {
  node: InfraNode;
  status: NodeStatus;
  incidentIds: string[];
  openCount: number;
  pendingCount: number;
  worstSeverity: IncidentSeverity | null;
}

/**
 * Aggregates incidents onto infrastructure nodes. One pass, O(n) — this is
 * the "clustering" that keeps the map cheap even with 1,000 records: the SVG
 * always renders 32 nodes, never one element per incident.
 *
 * Status precedence: pending local change > critical (open high/critical) >
 * warning (any other open incident) > operational.
 */
export function summarizeNodes(incidents: readonly MapIncident[]): Map<string, NodeSummary> {
  const summaries = new Map<string, NodeSummary>(
    NODES.map((node) => [
      node.id,
      {
        node,
        status: 'operational',
        incidentIds: [],
        openCount: 0,
        pendingCount: 0,
        worstSeverity: null,
      },
    ]),
  );
  for (const incident of incidents) {
    const summary = summaries.get(incident.nodeId ?? nodeIdForIncident(incident));
    if (!summary) continue;
    summary.incidentIds.push(incident.id);
    if (incident.syncStatus && incident.syncStatus !== 'synced') summary.pendingCount++;
    if (incident.status === 'resolved') continue;
    summary.openCount++;
    if (
      !summary.worstSeverity ||
      SEVERITY_RANK[incident.severity] > SEVERITY_RANK[summary.worstSeverity]
    ) {
      summary.worstSeverity = incident.severity;
    }
  }
  for (const summary of summaries.values()) {
    summary.status =
      summary.pendingCount > 0
        ? 'pending'
        : summary.worstSeverity && SEVERITY_RANK[summary.worstSeverity] >= SEVERITY_RANK.high
          ? 'critical'
          : summary.openCount > 0
            ? 'warning'
            : 'operational';
  }
  return summaries;
}
