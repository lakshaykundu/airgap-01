import { useLiveQuery } from 'dexie-react-hooks';
import { useRuntime } from '../app/RuntimeContext';
import {
  META_KEYS,
  type ActivityCategory,
  type ActivityEvent,
  type LocalIncident,
  type QueuedMutation,
} from '../database/db';

/**
 * React bindings for IndexedDB. Dexie live queries re-run when the underlying
 * tables change — in this tab or any other tab of the same origin — so the
 * database stays the single source of truth for durable data.
 */

/** All visible (non-tombstoned) incidents, newest first. `undefined` while loading. */
export function useIncidents(): LocalIncident[] | undefined {
  const { db } = useRuntime();
  return useLiveQuery(
    () =>
      db.incidents
        .orderBy('updatedAt')
        .reverse()
        .filter((incident) => incident.deleted !== 1)
        .toArray(),
    [db],
  );
}

export function useIncident(id: string | null | undefined): LocalIncident | null | undefined {
  const { db } = useRuntime();
  return useLiveQuery(async () => (id ? ((await db.incidents.get(id)) ?? null) : null), [db, id]);
}

export function useMutationQueue(): QueuedMutation[] | undefined {
  const { db } = useRuntime();
  return useLiveQuery(() => db.mutationQueue.orderBy('seq').toArray(), [db]);
}

/** Pending count straight from the database (never a cached counter). */
export function usePendingCount(): number {
  const { db } = useRuntime();
  return useLiveQuery(() => db.mutationQueue.count(), [db]) ?? 0;
}

export function useActivity(
  limit: number,
  categories?: ActivityCategory[],
): ActivityEvent[] | undefined {
  const { db } = useRuntime();
  const key = categories?.join(',') ?? '*';
  return useLiveQuery(async () => {
    let collection = db.activityEvents.orderBy('id').reverse();
    if (categories) collection = collection.filter((event) => categories.includes(event.category));
    return collection.limit(limit).toArray();
  }, [db, limit, key]);
}

export function useLastSyncAt(): string | undefined {
  const { db } = useRuntime();
  return useLiveQuery(
    async () => (await db.syncMetadata.get(META_KEYS.lastSyncAt))?.value as string | undefined,
    [db],
  );
}

export function useStressCount(): number | undefined {
  const { db } = useRuntime();
  return useLiveQuery(() => db.stressTestRecords.count(), [db]);
}
