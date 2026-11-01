import type { EventBus } from '../services/eventBus';
import type { IncidentService } from '../services/incidentService';
import type { SessionService } from '../services/sessionService';
import type { Repository } from '../database/repository';
import type { ServerConfig } from '../config';
import type { Database } from '../database/db';

export interface AppContext {
  config: ServerConfig;
  db: Database;
  repo: Repository;
  bus: EventBus;
  sessions: SessionService;
  incidents: IncidentService;
  startedAt: number;
}
