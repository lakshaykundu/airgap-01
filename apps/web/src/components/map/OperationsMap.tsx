import { LINKS, MAP_HEIGHT, MAP_WIDTH, NODES_BY_ID, SECTORS } from '@airgap/shared';
import { Crosshair, Minus, Plus } from 'lucide-react';
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { cn } from '../../utils/cn';
import {
  NODE_COLORS,
  summarizeNodes,
  type MapIncident,
  type NodeStatus,
  type NodeSummary,
} from './mapModel';

interface Transform {
  k: number;
  x: number;
  y: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

function clampTransform(t: Transform): Transform {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k));
  // Keep the map from being dragged entirely out of view.
  const minX = MAP_WIDTH - MAP_WIDTH * k;
  const minY = MAP_HEIGHT - MAP_HEIGHT * k;
  return { k, x: Math.min(0, Math.max(minX, t.x)), y: Math.min(0, Math.max(minY, t.y)) };
}

function zoomAround(t: Transform, factor: number, cx: number, cy: number): Transform {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
  const ratio = k / t.k;
  return clampTransform({ k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio });
}

export interface OperationsMapProps {
  incidents: readonly MapIncident[];
  visibleStatuses: NodeStatus[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  highlightNodeIds?: string[];
  className?: string;
  compact?: boolean;
}

const NodeMarker = memo(function NodeMarker({
  summary,
  k,
  selected,
  highlighted,
  dimmed,
  onSelect,
  onHover,
}: {
  summary: NodeSummary;
  k: number;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const { node, status, openCount, incidentIds } = summary;
  const color = NODE_COLORS[status];
  // Constant on-screen size regardless of zoom, slightly larger for busy nodes.
  const base = 6 + Math.min(6, Math.sqrt(incidentIds.length) * 1.1);
  const r = base / Math.sqrt(k);
  const animated = status === 'critical' || status === 'pending';
  const label = `${node.name}, ${status}, ${openCount} open incident${openCount === 1 ? '' : 's'}`;
  const onKey = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node.id);
    }
  };
  return (
    <g
      role="button"
      tabIndex={dimmed ? -1 : 0}
      aria-label={label}
      aria-pressed={selected}
      data-testid="map-node"
      data-node-id={node.id}
      data-status={status}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onKeyDown={onKey}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      className="cursor-pointer outline-none [&:focus-visible>circle.focus]:opacity-100"
      opacity={dimmed ? 0.18 : 1}
      style={{ transition: 'opacity 200ms' }}
    >
      {animated && !dimmed && (
        <circle
          className="ping-ring"
          cx={node.x}
          cy={node.y}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={1.5 / k}
        />
      )}
      <circle
        className="focus opacity-0"
        cx={node.x}
        cy={node.y}
        r={r + 6 / k}
        fill="none"
        stroke="#f5f7fa"
        strokeWidth={1.5 / k}
      />
      {(selected || highlighted) && (
        <circle
          cx={node.x}
          cy={node.y}
          r={r + 4 / k}
          fill="none"
          stroke={color}
          strokeWidth={2 / k}
          opacity={0.9}
        />
      )}
      <circle cx={node.x} cy={node.y} r={r * 2.4} fill={color} opacity={0.08} />
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill="#05070d"
        stroke={color}
        strokeWidth={2 / Math.sqrt(k)}
      />
      <circle cx={node.x} cy={node.y} r={r * 0.45} fill={color} />
      {openCount > 0 && (
        <text
          x={node.x + r + 3 / k}
          y={node.y - r}
          fontSize={10 / Math.sqrt(k)}
          className="fill-fg-2 font-mono"
          style={{ pointerEvents: 'none' }}
        >
          {openCount}
        </text>
      )}
    </g>
  );
});

/**
 * Custom SVG map of the fictional Meridian Basin. No tiles, no network: the
 * topology is bundled. Supports wheel/pinch-free zoom, drag-to-pan, buttons,
 * and full keyboard operation (Tab to nodes, arrows to pan, +/- to zoom).
 */
export function OperationsMap({
  incidents,
  visibleStatuses,
  selectedNodeId,
  onSelectNode,
  highlightNodeIds = [],
  className,
  compact = false,
}: OperationsMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; t: Transform; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  const summaries = useMemo(() => summarizeNodes(incidents), [incidents]);
  const highlight = useMemo(() => new Set(highlightNodeIds), [highlightNodeIds]);

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  }, []);

  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (compact && !event.ctrlKey && !event.metaKey) return; // let the page scroll in the compact overview
    const { x, y } = toSvgPoint(event.clientX, event.clientY);
    setTransform((t) => zoomAround(t, event.deltaY < 0 ? 1.15 : 1 / 1.15, x, y));
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    drag.current = { ...toSvgPoint(event.clientX, event.clientY), t: transform, moved: false };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const p = toSvgPoint(event.clientX, event.clientY);
    const dx = p.x - drag.current.x;
    const dy = p.y - drag.current.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.current.moved) svgRef.current?.setPointerCapture(event.pointerId);
    drag.current.moved = true;
    setTransform(
      clampTransform({ ...drag.current.t, x: drag.current.t.x + dx, y: drag.current.t.y + dy }),
    );
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.moved && svgRef.current?.hasPointerCapture(event.pointerId))
      svgRef.current.releasePointerCapture(event.pointerId);
    justDragged.current = Boolean(drag.current?.moved);
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = 40;
    const actions: Record<string, () => Transform> = {
      ArrowLeft: () => clampTransform({ ...transform, x: transform.x + step }),
      ArrowRight: () => clampTransform({ ...transform, x: transform.x - step }),
      ArrowUp: () => clampTransform({ ...transform, y: transform.y + step }),
      ArrowDown: () => clampTransform({ ...transform, y: transform.y - step }),
      '+': () => zoomAround(transform, 1.25, MAP_WIDTH / 2, MAP_HEIGHT / 2),
      '=': () => zoomAround(transform, 1.25, MAP_WIDTH / 2, MAP_HEIGHT / 2),
      '-': () => zoomAround(transform, 0.8, MAP_WIDTH / 2, MAP_HEIGHT / 2),
      '0': () => IDENTITY,
    };
    const action = actions[event.key];
    if (action && transform.k >= 1) {
      if (event.key.startsWith('Arrow') && transform.k === 1) return;
      event.preventDefault();
      setTransform(action());
    }
    if (event.key === 'Escape') onSelectNode(null);
  };

  const zoomBy = (factor: number) =>
    setTransform((t) => zoomAround(t, factor, MAP_WIDTH / 2, MAP_HEIGHT / 2));
  const hoveredSummary = hovered ? summaries.get(hovered) : undefined;
  const visible = new Set(visibleStatuses);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-line/70 bg-[#060912]',
        className,
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="block h-full w-full touch-none select-none"
        role="group"
        aria-label="Operations map of the Meridian Basin. Use Tab to reach nodes, arrow keys to pan and plus or minus to zoom."
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={() => {
          // A click that ends a pan gesture should not clear the selection.
          if (!justDragged.current) onSelectNode(null);
          justDragged.current = false;
        }}
        data-testid="operations-map"
      >
        <defs>
          <radialGradient id="map-vignette" cx="50%" cy="45%" r="70%">
            <stop offset="0" stopColor="#0d1830" stopOpacity="0.9" />
            <stop offset="1" stopColor="#05070d" stopOpacity="1" />
          </radialGradient>
          <pattern id="map-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path
              d="M25 0H0V25"
              fill="none"
              stroke="#233147"
              strokeOpacity="0.35"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#map-vignette)" />
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#map-grid)" />
          {SECTORS.map((sector) => (
            <g key={sector.id}>
              <polygon
                points={sector.polygon.map((p) => p.join(',')).join(' ')}
                fill="#0f1a2e"
                fillOpacity={0.55}
                stroke="#2a3b57"
                strokeWidth={1 / transform.k}
                strokeLinejoin="round"
              />
              <text
                x={sector.label[0]}
                y={sector.label[1]}
                className="fill-fg-3 font-mono"
                fontSize={10 / Math.sqrt(transform.k)}
                letterSpacing="0.12em"
                style={{ pointerEvents: 'none' }}
              >
                {sector.code}
              </text>
              {!compact && (
                <text
                  x={sector.label[0]}
                  y={sector.label[1] + 13 / Math.sqrt(transform.k)}
                  className="fill-fg-2"
                  fontSize={11 / Math.sqrt(transform.k)}
                  style={{ pointerEvents: 'none' }}
                >
                  {sector.name}
                </text>
              )}
            </g>
          ))}
          {LINKS.map((link) => {
            const a = NODES_BY_ID[link.from]!;
            const b = NODES_BY_ID[link.to]!;
            return (
              <g key={`${link.from}-${link.to}`} style={{ pointerEvents: 'none' }}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#24e5c0"
                  strokeOpacity={link.trunk ? 0.22 : 0.1}
                  strokeWidth={(link.trunk ? 1.6 : 1) / transform.k}
                />
                {link.trunk && (
                  <line
                    className="flow-line"
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#24e5c0"
                    strokeOpacity={0.55}
                    strokeWidth={1.2 / transform.k}
                  />
                )}
              </g>
            );
          })}
          {[...summaries.values()].map((summary) => (
            <NodeMarker
              key={summary.node.id}
              summary={summary}
              k={transform.k}
              selected={selectedNodeId === summary.node.id}
              highlighted={highlight.has(summary.node.id)}
              dimmed={!visible.has(summary.status)}
              onSelect={onSelectNode}
              onHover={setHovered}
            />
          ))}
        </g>
      </svg>

      {hoveredSummary && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-elevated/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: `${((hoveredSummary.node.x * transform.k + transform.x) / MAP_WIDTH) * 100}%`,
            top: `${((hoveredSummary.node.y * transform.k + transform.y) / MAP_HEIGHT) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 14px))',
          }}
          role="tooltip"
        >
          <p className="font-medium text-fg">{hoveredSummary.node.name}</p>
          <p className="mt-0.5 font-mono text-[10px] tracking-wider text-fg-3 uppercase">
            <span style={{ color: NODE_COLORS[hoveredSummary.status] }}>
              {hoveredSummary.status}
            </span>{' '}
            · {hoveredSummary.openCount} open · {hoveredSummary.incidentIds.length} total
          </p>
        </div>
      )}

      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {[
          { label: 'Zoom in', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => zoomBy(1.3) },
          {
            label: 'Zoom out',
            icon: <Minus className="h-3.5 w-3.5" />,
            onClick: () => zoomBy(1 / 1.3),
          },
          {
            label: 'Reset view',
            icon: <Crosshair className="h-3.5 w-3.5" />,
            onClick: () => setTransform(IDENTITY),
          },
        ].map((control) => (
          <button
            key={control.label}
            type="button"
            onClick={control.onClick}
            aria-label={control.label}
            title={control.label}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface/90 text-fg-2 backdrop-blur hover:bg-hover hover:text-fg"
          >
            {control.icon}
          </button>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] tracking-wider text-fg-3">
        MERIDIAN BASIN · ZOOM {transform.k.toFixed(1)}× · BUNDLED TOPOLOGY
      </p>
    </div>
  );
}

export function MapLegend({
  visible,
  onToggle,
}: {
  visible: NodeStatus[];
  onToggle: (status: NodeStatus) => void;
}) {
  const labels: Record<NodeStatus, string> = {
    operational: 'Operational',
    warning: 'Warning',
    critical: 'Critical',
    pending: 'Pending local change',
  };
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter map by node status">
      {(Object.keys(labels) as NodeStatus[]).map((status) => {
        const active = visible.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(status)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10.5px] tracking-wider uppercase transition-colors',
              active
                ? 'border-line bg-elevated text-fg-2'
                : 'border-line/50 text-fg-3 line-through opacity-60',
            )}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: NODE_COLORS[status] }}
              aria-hidden
            />
            {labels[status]}
          </button>
        );
      })}
    </div>
  );
}
