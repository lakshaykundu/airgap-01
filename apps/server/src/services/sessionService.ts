import { randomUUID } from 'node:crypto';
import { generateIncidentFields, type Incident } from '@airgap/shared';
import type { Database, Sql } from '../database/db';
import type { Repository } from '../database/repository';
import { ApiError } from '../utils/errors';
import type { EventBus } from './eventBus';

export const SEED_INCIDENT_COUNT = 26;
const SEED = 20260101;
const TOUCH_INTERVAL_MS = 60_000;
/** On serverless there is no long-lived timer, so expiry also runs opportunistically. */
const CLEANUP_PROBABILITY = 0.05;

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

  async create(): Promise<{
    sessionId: string;
    createdAt: string;
    incidents: Incident[];
    cursor: number;
  }> {
    if (Math.random() < CLEANUP_PROBABILITY) await this.cleanupExpired().catch(() => undefined);
    const sessionId = randomUUID();
    const createdAt = this.now().toISOString();
    return this.db.transaction(async (tx) => {
      await this.repo.insertSession(tx, sessionId, createdAt);
      const incidents = await this.seed(tx, sessionId);
      return {
        sessionId,
        createdAt,
        incidents,
        cursor: await this.repo.latestEventSeq(tx, sessionId),
      };
    });
  }

  /** Resolves a session and refreshes its TTL. Throws structured 401s. */
  async require(sessionId: string | undefined): Promise<string> {
    if (!sessionId) {
      throw new ApiError(401, 'SESSION_REQUIRED', 'Missing demo session header');
    }
    const session = await this.repo.getSession(this.db, sessionId);
    if (!session) throw new ApiError(401, 'SESSION_NOT_FOUND', 'Unknown or expired demo session');
    const now = this.now();
    if (now.getTime() - Date.parse(session.last_seen_at) > TOUCH_INTERVAL_MS) {
      await this.repo.touchSession(this.db, sessionId, now.toISOString());
    }
    return sessionId;
  }

  async historyFloor(sessionId: string): Promise<number> {
    return (await this.repo.getSession(this.db, sessionId))?.history_floor ?? 0;
  }

  /** Wipes and reseeds ONE session. Other visitors' sessions are untouched. */
  async reset(sessionId: string): Promise<{ incidents: Incident[]; cursor: number }> {
    const result = await this.db.transaction(async (tx) => {
      await this.repo.lockSession(tx, sessionId);
      await this.repo.clearSessionData(tx, sessionId);
      const incidents = await this.seed(tx, sessionId);
      const event = await this.repo.insertEvent(
        tx,
        sessionId,
        'session.reset',
        null,
        null,
        null,
        'system',
        this.now().toISOString(),
      );
      // Clients holding a cursor from before the reset must do a full refresh.
      await this.repo.setHistoryFloor(tx, sessionId, event.seq);
      return { incidents, cursor: event.seq, event };
    });
    this.bus.publish(sessionId, result.event);
    return { incidents: result.incidents, cursor: result.cursor };
  }

  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(this.now().getTime() - this.ttlDays * 86_400_000).toISOString();
    return this.repo.deleteSessionsSeenBefore(this.db, cutoff);
  }

  private async seed(tx: Sql, sessionId: string): Promise<Incident[]> {
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
    await this.repo.insertIncidents(tx, sessionId, incidents);
    await this.repo.insertIncidentVersions(
      tx,
      sessionId,
      incidents.map((incident) => ({ incident, mutationId: null, deleted: false })),
    );
    return incidents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
