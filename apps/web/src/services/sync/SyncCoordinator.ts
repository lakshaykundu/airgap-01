import { TAB_ID } from '../../database/activity';

export type CoordinatorMessage =
  | { type: 'sync-requested'; from: string }
  | { type: 'sync-finished'; from: string; acked: number }
  | { type: 'simulator-changed'; from: string };

const LOCK_NAME = 'airgap-01:sync';
const LEASE_KEY = 'airgap-01:sync-lease';
const LEASE_MS = 8000;

/**
 * Cross-tab coordination.
 *
 * - Mutual exclusion: only one tab drains the queue at a time. Uses the Web
 *   Locks API (released automatically if the tab crashes or reloads); falls
 *   back to a renewable localStorage lease where Web Locks are unavailable.
 * - Notification: BroadcastChannel tells other tabs to re-check the queue.
 *
 * The server's idempotency keys remain the final safeguard: even if two tabs
 * ever sent the same mutation, it would be applied once.
 */
export class SyncCoordinator {
  private readonly channel: BroadcastChannel | null;
  private readonly listeners = new Set<(message: CoordinatorMessage) => void>();
  private memoryLockHeld = false;

  constructor(
    private readonly options: {
      channelName?: string;
      /** Force a mechanism (tests). Defaults to the best one available. */
      mechanism?: 'web-locks' | 'storage-lease' | 'in-memory';
    } = {},
  ) {
    this.channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(options.channelName ?? 'airgap-01');
    this.channel?.addEventListener('message', (event: MessageEvent<CoordinatorMessage>) => {
      for (const listener of this.listeners) listener(event.data);
    });
  }

  get mechanism(): 'web-locks' | 'storage-lease' | 'in-memory' {
    if (this.options.mechanism) return this.options.mechanism;
    if (typeof navigator !== 'undefined' && navigator.locks) return 'web-locks';
    if (typeof localStorage !== 'undefined') return 'storage-lease';
    return 'in-memory';
  }

  /** Runs `fn` while holding the sync lock, or returns `acquired: false` if another tab holds it. */
  async withLock<T>(
    fn: () => Promise<T>,
  ): Promise<{ acquired: true; result: T } | { acquired: false }> {
    switch (this.mechanism) {
      case 'web-locks':
        return navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (!lock) return { acquired: false as const };
          return { acquired: true as const, result: await fn() };
        });
      case 'storage-lease':
        return this.withLease(fn);
      default: {
        if (this.memoryLockHeld) return { acquired: false };
        this.memoryLockHeld = true;
        try {
          return { acquired: true, result: await fn() };
        } finally {
          this.memoryLockHeld = false;
        }
      }
    }
  }

  private async withLease<T>(
    fn: () => Promise<T>,
  ): Promise<{ acquired: true; result: T } | { acquired: false }> {
    const read = (): { owner: string; expiresAt: number } | null => {
      try {
        return JSON.parse(localStorage.getItem(LEASE_KEY) ?? 'null');
      } catch {
        return null;
      }
    };
    const lease = read();
    if (lease && lease.owner !== TAB_ID && lease.expiresAt > Date.now()) return { acquired: false };
    const write = () =>
      localStorage.setItem(
        LEASE_KEY,
        JSON.stringify({ owner: TAB_ID, expiresAt: Date.now() + LEASE_MS }),
      );
    write();
    // Re-read to lose gracefully if another tab wrote at the same moment.
    if (read()?.owner !== TAB_ID) return { acquired: false };
    const renew = setInterval(write, LEASE_MS / 3);
    try {
      return { acquired: true, result: await fn() };
    } finally {
      clearInterval(renew);
      if (read()?.owner === TAB_ID) localStorage.removeItem(LEASE_KEY);
    }
  }

  /**
   * Waits for (rather than skips) an exclusive named lock. Used for one-off
   * critical sections such as creating the demo session, so two tabs opened
   * at the same moment cannot both create one.
   */
  async runExclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (this.mechanism === 'web-locks') return navigator.locks.request(`airgap-01:${name}`, fn);
    return fn();
  }

  broadcast(message: CoordinatorMessage): void {
    this.channel?.postMessage(message);
  }

  subscribe(listener: (message: CoordinatorMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.channel?.close();
    this.listeners.clear();
  }
}
