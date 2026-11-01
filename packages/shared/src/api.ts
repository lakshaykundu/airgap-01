import { z } from 'zod';
import { incidentSchema, type Incident } from './incident';

export const SESSION_HEADER = 'x-airgap-session';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAY_HEADER = 'idempotent-replay';

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'INCIDENT_DELETED',
  'VERSION_CONFLICT',
  'ALREADY_EXISTS',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'SESSION_REQUIRED',
  'SESSION_NOT_FOUND',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'REALTIME_UNAVAILABLE',
  'LIMIT_REACHED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Body of a 409 VERSION_CONFLICT or 410 INCIDENT_DELETED response. */
export interface ConflictDetails {
  incidentId: string;
  expectedVersion: number;
  actualVersion: number | null;
  serverIncident: Incident | null;
  deleted: boolean;
}

export const conflictDetailsSchema = z.object({
  incidentId: z.string(),
  expectedVersion: z.number().int(),
  actualVersion: z.number().int().nullable(),
  serverIncident: incidentSchema.nullable(),
  deleted: z.boolean(),
});

export interface HealthResponse {
  ok: true;
  time: string;
  uptimeSeconds: number;
  /** How clients should receive live changes: an SSE stream, or polling (serverless). */
  realtime: 'sse' | 'poll';
}

export interface CreateSessionResponse {
  sessionId: string;
  createdAt: string;
  incidents: Incident[];
  cursor: number;
}

export interface ListIncidentsResponse {
  incidents: Incident[];
  cursor: number;
}

export interface IncidentResponse {
  incident: Incident;
}

export interface DeleteIncidentResponse {
  id: string;
  deleted: true;
  version: number;
}

export const SERVER_EVENT_TYPES = [
  'incident.created',
  'incident.updated',
  'incident.deleted',
  'session.reset',
] as const;
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];

export type ServerEventSource = 'client' | 'remote-demo' | 'system';

export interface ServerEvent {
  seq: number;
  type: ServerEventType;
  incidentId: string | null;
  version: number | null;
  /** Snapshot after the change; null for deletions and resets. */
  incident: Incident | null;
  /** Idempotency key of the mutation that caused this event, if any. */
  mutationId: string | null;
  source: ServerEventSource;
  createdAt: string;
}

export interface EventsResponse {
  events: ServerEvent[];
  cursor: number;
  /** True when the requested cursor predates retained history; the client must do a full refresh. */
  resetRequired: boolean;
}

export interface RemoteEditResponse {
  incident: Incident;
  changedFields: string[];
}

export const remoteEditBodySchema = z.object({
  incidentId: z.uuid().optional(),
});
