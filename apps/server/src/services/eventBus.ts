import type { ServerEvent } from '@airgap/shared';

type Listener = (event: ServerEvent) => void;

/**
 * In-process fan-out of committed events to Server-Sent Event streams.
 * Events are persisted first; the bus only notifies live subscribers, and a
 * reconnecting client catches up from its cursor via the events table.
 */
export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(sessionId: string, listener: Listener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(sessionId);
    };
  }

  publish(sessionId: string, event: ServerEvent): void {
    for (const listener of this.listeners.get(sessionId) ?? []) listener(event);
  }

  subscriberCount(sessionId: string): number {
    return this.listeners.get(sessionId)?.size ?? 0;
  }
}
