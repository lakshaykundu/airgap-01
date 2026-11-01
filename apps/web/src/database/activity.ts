import type { ActivityEvent, AirgapDatabase } from './db';

/** Identifies the tab that recorded an event (useful when several tabs share one database). */
export const TAB_ID = (
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)
).slice(0, 8);

const MAX_EVENTS = 1500;
let writesSincePrune = 0;

export type ActivityInput = Omit<ActivityEvent, 'id' | 'ts' | 'tabId'> & { ts?: string };

/**
 * Appends a structured event to the durable activity log. Callers inside a
 * Dexie transaction must include `activityEvents` in its scope.
 */
export async function logActivity(db: AirgapDatabase, input: ActivityInput): Promise<void> {
  await db.activityEvents.add({
    ...input,
    ts: input.ts ?? new Date().toISOString(),
    tabId: TAB_ID,
  });
  if (++writesSincePrune >= 100) {
    writesSincePrune = 0;
    // Run outside any caller transaction.
    setTimeout(() => void pruneActivity(db).catch(() => undefined), 0);
  }
}

export async function pruneActivity(db: AirgapDatabase): Promise<void> {
  const count = await db.activityEvents.count();
  if (count <= MAX_EVENTS) return;
  const cutoff = await db.activityEvents
    .orderBy('id')
    .offset(count - MAX_EVENTS)
    .first();
  if (cutoff?.id !== undefined) await db.activityEvents.where('id').below(cutoff.id).delete();
}
