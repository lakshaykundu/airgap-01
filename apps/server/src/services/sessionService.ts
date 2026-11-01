import { randomUUID } from 'node:crypto';
import { generateIncidentFields, type Incident } from '@airgap/shared';
import { transaction, type Database } from '../database/db';
import type { Repository } from '../database/repository';
import { ApiError } from '../utils/errors';
import type { EventBus } from './eventBus';

export const SEED_INCIDENT_COUNT = 26;
const SEED = 20260101;
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Demo sessions isolate each visitor's workspace. A session id is an opaque
 * random UUID — it scopes fictional demo data and is NOT an auth credential.
 */
export class SessionService {
  constructor(
    private readonly db: Database,
    private readonly repo: Repository,
    private readonly bus: EventBus,
    private readonly ttlDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(): { sessionId: string; createdAt: string; incidents: Incident[]; cursor: number } {
    const sessionId = randomUUID();
    const createdAt = this.now().toISOString();
    return transaction(this.db, () => {
      this.repo.insertSession(sessionId, createdAt);
      const incidents = this.seed(sessionId);
      return { sessionId, createdAt, incidents, cursor: this.repo.latestEventSeq(sessionId) };
    });
  }

  /** Resolves a session and refreshes its TTL. Throws structured 401s. */
  require(sessionId: string | undefined): string {
    if (!sessionId) {
      throw new ApiError(401, 'SESSION_REQUIRED', 'Missing demo session header');
    }
    const session = this.repo.getSession(sessionId);
    if (!session) throw new ApiError(401, 'SESSION_NOT_FOUND', 'Unknown or expired demo session');
    const now = this.now();
    if (now.getTime() - Date.parse(session.last_seen_at) > TOUCH_INTERVAL_MS) {
      this.repo.touchSession(sessionId, now.toISOString());
    }
    return sessionId;
  }

  historyFloor(sessionId: string): number {
    return this.repo.getSession(sessionId)?.history_floor ?? 0;
  }

  /** Wipes and reseeds ONE session. Other visitors' sessions are untouched. */
  reset(sessionId: string): { incidents: Incident[]; cursor: number } {
    const result = transaction(this.db, () => {
      this.repo.clearSessionData(sessionId);
      const incidents = this.seed(sessionId);
      const event = this.repo.insertEvent(
        sessionId,
        'session.reset',
        null,
        null,
        null,
        'system',
        this.now().toISOString(),
      );
      // Clients holding a cursor from before the reset must do a full refresh.
      this.repo.setHistoryFloor(sessionId, event.seq);
      return { incidents, cursor: event.seq, event };
    });
    this.bus.publish(sessionId, result.event);
    return { incidents: result.incidents, cursor: result.cursor };
  }

  cleanupExpired(): number {
    const cutoff = new Date(this.now().getTime() - this.ttlDays * 86_400_000).toISOString();
    return this.repo.deleteSessionsSeenBefore(cutoff);
  }

  private seed(sessionId: string): Incident[] {
    const reference = this.now().getTime();
    const incidents = generateIncidentFields(SEED, SEED_INCIDENT_COUNT).map(
      ({ ageMinutes, updatedAfterMinutes, ...fields }): Incident => {
        const createdAt = new Date(reference - ageMinutes * 60_000);
        const updatedAt = new Date(createdAt.getTime() + updatedAfterMinutes * 60_000);
        return {
          ...fields,
          id: randomUUID(),
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          version: 1,
        };
      },
    );
    for (const incident of incidents) {
      this.repo.insertIncident(sessionId, incident);
      this.repo.insertIncidentVersion(sessionId, incident, null, false);
    }
    return incidents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
