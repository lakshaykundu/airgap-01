import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useRef } from 'react';
import type { LocalIncident } from '../../database/db';
import { useNow } from '../../hooks/useNow';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { IncidentRow } from './IncidentRow';

/**
 * Virtualized list: only rows in (or near) the viewport are mounted, so the
 * DOM stays small no matter how many incidents are cached locally.
 */
export function IncidentList({
  incidents,
  height = 'calc(100dvh - 300px)',
}: {
  incidents: LocalIncident[];
  height?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const selected = useAppSelector((state) => state.ui.detailId);
  const now = useNow(30_000);
  const virtualizer = useVirtualizer({
    count: incidents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 66,
    overscan: 8,
    getItemKey: (index) => incidents[index]!.id,
  });
  const onSelect = useCallback((id: string) => dispatch(uiActions.openDetail(id)), [dispatch]);

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto"
      style={{ height, minHeight: 320 }}
      data-testid="incident-list"
      role="list"
      aria-label={`${incidents.length} incidents`}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const incident = incidents[item.index]!;
          return (
            <div
              key={item.key}
              role="listitem"
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <IncidentRow
                incident={incident}
                onSelect={onSelect}
                selected={selected === incident.id}
                now={now}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
