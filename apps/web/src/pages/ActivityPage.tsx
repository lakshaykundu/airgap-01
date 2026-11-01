import { incidentCode } from '@airgap/shared';
import { useState } from 'react';
import { ActivityTimeline, ConnectionTimeline } from '../components/dashboard/Timelines';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { SegmentedControl, Skeleton } from '../components/ui/States';
import type { ActivityCategory } from '../database/db';
import { useActivity } from '../hooks/useLiveData';
import { cn } from '../utils/cn';
import { formatTime } from '../utils/format';

const LEVEL = {
  info: 'text-fg-2',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
};
const CATEGORY_STYLE: Record<ActivityCategory, string> = {
  user: 'bg-accent/10 text-[#c3b5ff]',
  sync: 'bg-primary/10 text-primary',
  network: 'bg-[#5aa9ff]/10 text-[#8cc4ff]',
  server: 'bg-success/10 text-success',
  system: 'bg-elevated text-fg-2',
  simulator: 'bg-warning/10 text-warning',
};

export default function ActivityPage() {
  const [view, setView] = useState<'all' | ActivityCategory>('all');
  const events = useActivity(400, view === 'all' ? undefined : [view]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Durable · stored in IndexedDB"
        title="Activity Log"
        description="Structured events recorded by the app itself — local writes, queue transitions, server acknowledgements and connectivity changes. Events tagged SERVER came from the backend's change feed; SIMULATOR events were triggered in the Chaos Lab."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel lit className="overflow-hidden">
          <PanelHeader
            title="Event stream"
            eyebrow={`${events?.length ?? 0} most recent`}
            actions={
              <SegmentedControl
                label="Filter events"
                value={view}
                onChange={setView}
                options={(
                  ['all', 'user', 'sync', 'network', 'server', 'simulator', 'system'] as const
                ).map((v) => ({ value: v, label: v }))}
                className="hidden md:inline-flex"
              />
            }
          />
          <div className="max-h-[70dvh] overflow-y-auto">
            {!events ? (
              <Skeleton className="m-4 h-64" />
            ) : (
              <ol className="divide-y divide-line/40">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="grid grid-cols-[64px_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[64px_220px_1fr]"
                  >
                    <span className="font-mono text-[11px] text-fg-3 tabular-nums">
                      {formatTime(event.ts)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded px-1.5 font-mono text-[9.5px] tracking-wider uppercase',
                          CATEGORY_STYLE[event.category],
                        )}
                      >
                        {event.category}
                      </span>
                      <span className={cn('truncate font-mono text-[11px]', LEVEL[event.level])}>
                        {event.type}
                      </span>
                    </span>
                    <span className="col-span-2 text-[13px] text-fg-2 sm:col-span-1">
                      {event.message}
                      {event.entityId && (
                        <span className="ml-2 font-mono text-[10.5px] text-fg-3">
                          {incidentCode(event.entityId)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel lit>
            <PanelHeader title="Connection timeline" eyebrow="State transitions" />
            <div className="p-4">
              <ConnectionTimeline limit={18} />
            </div>
          </Panel>
          <Panel lit>
            <PanelHeader title="Operational summary" eyebrow="Human-readable" />
            <div className="p-4">
              <ActivityTimeline limit={10} />
            </div>
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}
