import { FileSearch, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { IncidentFiltersBar } from '../components/incidents/IncidentFilters';
import { IncidentList } from '../components/incidents/IncidentList';
import { PageContainer, PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { EmptyState, Skeleton } from '../components/ui/States';
import { applyIncidentFilters } from '../features/incidents/filtering';
import { useIncidents } from '../hooks/useLiveData';
import { useUrlFilterSync } from '../hooks/useUrlFilterSync';
import { useAppDispatch, useAppSelector } from '../store';
import { filtersActions } from '../store/filtersSlice';
import { uiActions } from '../store/uiSlice';

export function IncidentsPage() {
  useUrlFilterSync();
  const incidents = useIncidents();
  const filters = useAppSelector((state) => state.filters);
  const dispatch = useAppDispatch();
  // Filtering runs against the local IndexedDB snapshot, so it works offline.
  const filtered = useMemo(
    () => (incidents ? applyIncidentFilters(incidents, filters) : []),
    [incidents, filters],
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Incident management"
        title="Incident Explorer"
        description="Every read comes from IndexedDB. Create, edit and delete work identically with or without a connection."
        actions={
          <Button
            variant="primary"
            mono
            onClick={() => dispatch(uiActions.openEditor('new'))}
            data-testid="create-incident"
            data-tour="create-incident"
          >
            <Plus className="h-4 w-4" /> Create incident
          </Button>
        }
      />
      <Panel lit className="@container">
        <div className="border-b border-line/70 p-4">
          <IncidentFiltersBar resultCount={filtered.length} total={incidents?.length ?? 0} />
        </div>
        <div
          className="hidden grid-cols-[88px_minmax(0,1fr)_96px_112px_92px] gap-x-4 border-b border-line/70 px-4 py-2 @3xl:grid"
          aria-hidden
        >
          {['ID', 'Incident', 'Severity', 'Status', 'Sync'].map((label) => (
            <span key={label} className="label-xs">
              {label}
            </span>
          ))}
        </div>
        {!incidents ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileSearch className="h-6 w-6" />}
            title={incidents.length === 0 ? 'No incidents yet' : 'No incidents match these filters'}
            description={
              incidents.length === 0
                ? 'Create the first one — it works offline.'
                : 'Try removing a filter or changing the search.'
            }
            action={
              incidents.length === 0 ? (
                <Button
                  variant="primary"
                  mono
                  size="sm"
                  onClick={() => dispatch(uiActions.openEditor('new'))}
                >
                  Create incident
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => dispatch(filtersActions.clearFilters())}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <IncidentList incidents={filtered} />
        )}
      </Panel>
    </PageContainer>
  );
}
