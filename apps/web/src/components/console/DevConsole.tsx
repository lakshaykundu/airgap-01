import { TerminalSquare, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import type { ActivityCategory } from '../../database/db';
import { useActivity } from '../../hooks/useLiveData';
import { useAppDispatch } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { formatTime } from '../../utils/format';
import { SegmentedControl } from '../ui/States';

const LEVEL_COLOR = {
  info: 'text-fg-2',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
};
const CATEGORIES: (ActivityCategory | 'all')[] = [
  'all',
  'sync',
  'network',
  'server',
  'user',
  'simulator',
  'system',
];

function RequestLog() {
  const { transport } = useRuntime();
  const log = useSyncExternalStore(
    (cb) => transport.subscribeLog(cb),
    () => transport.requestLog,
  );
  const entries = log;
  return (
    <ol className="font-mono text-[11px]">
      {entries.length === 0 && <li className="px-4 py-3 text-fg-3">No requests yet.</li>}
      {entries.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[72px_56px_1fr_auto_auto] gap-3 border-b border-line/30 px-4 py-1"
        >
          <span className="text-fg-3">{formatTime(e.at)}</span>
          <span className="text-fg-2">{e.method}</span>
          <span className="truncate text-fg">{e.path}</span>
          <span className={e.ok ? 'text-success' : 'text-danger'}>
            {e.outcome}
            {e.replayed ? ' (replay)' : ''}
          </span>
          <span className="text-right text-fg-3 tabular-nums">
            {e.durationMs} ms{e.injectedLatencyMs ? ` (+${e.injectedLatencyMs} sim)` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Structured internal events, straight from the durable activity log. */
export default function DevConsole() {
  const dispatch = useAppDispatch();
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all');
  const [tab, setTab] = useState<'events' | 'requests'>('events');
  const events = useActivity(300, category === 'all' ? undefined : [category]);
  const bottom = useRef<HTMLLIElement>(null);
  const ordered = [...(events ?? [])].reverse();

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [ordered.length, tab]);

  return (
    <section
      aria-label="Developer console"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[300px] flex-col border-t border-line bg-[#04060b]/97 backdrop-blur-xl"
      data-testid="dev-console"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-2">
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-fg-2 uppercase">
          <TerminalSquare className="h-3.5 w-3.5 text-primary" /> Developer console
        </p>
        <SegmentedControl
          label="Console view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'events', label: 'Events' },
            { value: 'requests', label: 'Requests' },
          ]}
        />
        {tab === 'events' && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by category">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase',
                  category === c ? 'bg-elevated text-fg' : 'text-fg-3 hover:text-fg-2',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => dispatch(uiActions.setDevConsole(false))}
          className="ml-auto rounded p-1 text-fg-3 hover:bg-hover hover:text-fg"
          aria-label="Close developer console"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {tab === 'requests' ? (
          <RequestLog />
        ) : (
          <ol className="font-mono text-[11px] leading-5">
            {ordered.map((event) => (
              <li key={event.id} className="flex gap-3 px-4 hover:bg-white/[0.02]">
                <span className="shrink-0 text-fg-3">[{formatTime(event.ts)}]</span>
                <span className={cn('w-56 shrink-0 truncate', LEVEL_COLOR[event.level])}>
                  {event.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg-2" title={event.message}>
                  {event.message}
                </span>
                <span className="hidden shrink-0 text-fg-3 md:inline">tab:{event.tabId}</span>
              </li>
            ))}
            <li ref={bottom} aria-hidden />
          </ol>
        )}
      </div>
    </section>
  );
}
