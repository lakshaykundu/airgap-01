/**
 * Fictional infrastructure topology for the "Meridian Basin" region.
 * Coordinates live in a 1000 × 640 map space and are bundled with the app so
 * the operations map renders without any network access or external tiles.
 */

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 640;

export const SECTOR_IDS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08'] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

type Point = readonly [number, number];

// Shared vertices so neighbouring sector polygons tile without gaps.
const A0: Point = [70, 60];
const A1: Point = [300, 40];
const A2: Point = [530, 70];
const A3: Point = [770, 45];
const A4: Point = [950, 90];
const M0: Point = [40, 330];
const M1: Point = [280, 300];
const M2: Point = [540, 340];
const M3: Point = [750, 310];
const M4: Point = [975, 350];
const B0: Point = [80, 600];
const B1: Point = [310, 615];
const B2: Point = [520, 590];
const B3: Point = [760, 620];
const B4: Point = [940, 580];
const E1t: Point = [315, 165];
const E2t: Point = [515, 195];
const E3t: Point = [785, 180];
const E1b: Point = [265, 455];
const E2b: Point = [560, 470];
const E3b: Point = [735, 465];
const H0: Point = [160, 345];
const H1: Point = [410, 320];
const H2: Point = [650, 355];
const H3: Point = [860, 300];

export type NodeKind = 'relay' | 'substation' | 'datacenter' | 'pumping' | 'uplink' | 'depot';

export interface InfraNode {
  id: string;
  name: string;
  kind: NodeKind;
  sectorId: SectorId;
  x: number;
  y: number;
}

export interface Sector {
  id: SectorId;
  code: string;
  name: string;
  polygon: readonly Point[];
  label: Point;
}

export const SECTORS: readonly Sector[] = [
  {
    id: 's01',
    code: 'SECTOR 01',
    name: 'Northern Relay',
    polygon: [A0, A1, E1t, M1, H0, M0],
    label: [110, 95],
  },
  {
    id: 's02',
    code: 'SECTOR 02',
    name: 'Central Logistics',
    polygon: [A1, A2, E2t, M2, H1, M1, E1t],
    label: [340, 85],
  },
  {
    id: 's03',
    code: 'SECTOR 03',
    name: 'East Grid',
    polygon: [A2, A3, E3t, M3, H2, M2, E2t],
    label: [570, 105],
  },
  {
    id: 's04',
    code: 'SECTOR 04',
    name: 'Harbor Uplink',
    polygon: [A3, A4, M4, H3, M3, E3t],
    label: [800, 100],
  },
  {
    id: 's05',
    code: 'SECTOR 05',
    name: 'Western Reservoir',
    polygon: [M0, H0, M1, E1b, B1, B0],
    label: [80, 380],
  },
  {
    id: 's06',
    code: 'SECTOR 06',
    name: 'Southern Freight',
    polygon: [M1, H1, M2, E2b, B2, B1, E1b],
    label: [320, 370],
  },
  {
    id: 's07',
    code: 'SECTOR 07',
    name: 'Ridge Array',
    polygon: [M2, H2, M3, E3b, B3, B2, E2b],
    label: [580, 395],
  },
  {
    id: 's08',
    code: 'SECTOR 08',
    name: 'Delta Exchange',
    polygon: [M3, H3, M4, B4, B3, E3b],
    label: [790, 360],
  },
];

const SECTOR_CENTERS: Record<SectorId, Point> = {
  s01: [180, 200],
  s02: [415, 190],
  s03: [655, 205],
  s04: [870, 200],
  s05: [170, 475],
  s06: [415, 470],
  s07: [645, 490],
  s08: [860, 465],
};

const PREFIX: Record<SectorId, string> = {
  s01: 'NR',
  s02: 'CL',
  s03: 'EG',
  s04: 'HU',
  s05: 'WR',
  s06: 'SF',
  s07: 'RA',
  s08: 'DX',
};

const NODE_LAYOUT: { dx: number; dy: number; kind: NodeKind; label: string }[] = [
  { dx: -62, dy: -48, kind: 'relay', label: 'Relay' },
  { dx: 58, dy: -36, kind: 'substation', label: 'Substation' },
  { dx: -40, dy: 56, kind: 'pumping', label: 'Pumping Station' },
  { dx: 64, dy: 48, kind: 'datacenter', label: 'Compute Hall' },
];

const SECTOR_SPECIAL: Partial<Record<SectorId, NodeKind>> = {
  s04: 'uplink',
  s06: 'depot',
  s02: 'depot',
  s07: 'uplink',
};

/** Deterministic wobble so the four nodes of every sector are not identical copies. */
function wobble(seed: number): number {
  return Math.round(Math.sin(seed * 12.9898) * 14);
}

export const NODES: readonly InfraNode[] = SECTOR_IDS.flatMap((sectorId, sectorIndex) =>
  NODE_LAYOUT.map((layout, nodeIndex) => {
    const [cx, cy] = SECTOR_CENTERS[sectorId];
    const kind =
      nodeIndex === 3 && SECTOR_SPECIAL[sectorId] ? SECTOR_SPECIAL[sectorId] : layout.kind;
    const label =
      kind === 'uplink' ? 'Uplink Array' : kind === 'depot' ? 'Freight Depot' : layout.label;
    return {
      id: `${PREFIX[sectorId]}-0${nodeIndex + 1}`,
      name: `${label} ${PREFIX[sectorId]}-0${nodeIndex + 1}`,
      kind,
      sectorId,
      x: cx + layout.dx + wobble(sectorIndex * 7 + nodeIndex),
      y: cy + layout.dy + wobble(sectorIndex * 11 + nodeIndex + 3),
    };
  }),
);

export const NODES_BY_SECTOR: Record<SectorId, InfraNode[]> = Object.fromEntries(
  SECTOR_IDS.map((id) => [id, NODES.filter((node) => node.sectorId === id)]),
) as Record<SectorId, InfraNode[]>;

export interface NodeLink {
  from: string;
  to: string;
  trunk: boolean;
}

/** Links: a ring inside each sector, plus trunks between neighbouring sectors. */
export const LINKS: readonly NodeLink[] = (() => {
  const links: NodeLink[] = [];
  const nodesOf = (id: SectorId) => NODES_BY_SECTOR[id];
  for (const id of SECTOR_IDS) {
    const [n0, n1, n2, n3] = nodesOf(id) as [InfraNode, InfraNode, InfraNode, InfraNode];
    links.push(
      { from: n0.id, to: n1.id, trunk: false },
      { from: n1.id, to: n3.id, trunk: false },
      { from: n3.id, to: n2.id, trunk: false },
      { from: n2.id, to: n0.id, trunk: false },
    );
  }
  const horizontal: [SectorId, SectorId][] = [
    ['s01', 's02'],
    ['s02', 's03'],
    ['s03', 's04'],
    ['s05', 's06'],
    ['s06', 's07'],
    ['s07', 's08'],
  ];
  for (const [left, right] of horizontal) {
    links.push({ from: nodesOf(left)[1]!.id, to: nodesOf(right)[0]!.id, trunk: true });
    links.push({ from: nodesOf(left)[3]!.id, to: nodesOf(right)[2]!.id, trunk: false });
  }
  const vertical: [SectorId, SectorId][] = [
    ['s01', 's05'],
    ['s02', 's06'],
    ['s03', 's07'],
    ['s04', 's08'],
  ];
  for (const [top, bottom] of vertical) {
    links.push({ from: nodesOf(top)[2]!.id, to: nodesOf(bottom)[0]!.id, trunk: true });
  }
  return links;
})();

export const NODES_BY_ID: Record<string, InfraNode> = Object.fromEntries(
  NODES.map((node) => [node.id, node]),
);

export const SECTORS_BY_ID: Record<SectorId, Sector> = Object.fromEntries(
  SECTORS.map((sector) => [sector.id, sector]),
) as Record<SectorId, Sector>;

export function sectorLabel(id: string): string {
  const sector = SECTORS_BY_ID[id as SectorId];
  return sector ? `${sector.code} — ${sector.name}` : id;
}

/** FNV-1a string hash — stable across runtimes. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Incidents belong to a sector; the map attaches each one to a node inside that
 * sector using a stable hash of its id, so placement never changes between
 * reloads, tabs or devices.
 */
export function nodeIdForIncident(incident: { id: string; sectorId: string }): string {
  const nodes = NODES_BY_SECTOR[incident.sectorId as SectorId] ?? NODES_BY_SECTOR.s01;
  return nodes[hashString(incident.id) % nodes.length]!.id;
}

export const OPERATORS = [
  'A. Rao',
  'M. Chen',
  'K. Okafor',
  'S. Lindqvist',
  'R. Mehta',
  'J. Alvarez',
  'T. Nakamura',
  'L. Haddad',
] as const;
