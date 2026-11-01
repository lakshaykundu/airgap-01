import type {
  CreateIncidentBody,
  CreateSessionResponse,
  DeleteIncidentResponse,
  EventsResponse,
  HealthResponse,
  IncidentChanges,
  IncidentResponse,
  ListIncidentsResponse,
  RemoteEditResponse,
} from '@airgap/shared';
import type { Transport, TransportResponse } from './transport';

/** Typed REST client. All requests flow through the (chaos-aware) transport. */
export class ApiClient {
  constructor(readonly transport: Transport) {}

  health(): Promise<TransportResponse<HealthResponse>> {
    return this.transport.request('GET', '/api/health', { kind: 'health', timeoutMs: 4000 });
  }

  createSession(): Promise<TransportResponse<CreateSessionResponse>> {
    return this.transport.request('POST', '/api/demo/sessions', { kind: 'data' });
  }

  listIncidents(): Promise<TransportResponse<ListIncidentsResponse>> {
    return this.transport.request('GET', '/api/incidents');
  }

  getIncident(id: string): Promise<TransportResponse<IncidentResponse>> {
    return this.transport.request('GET', `/api/incidents/${id}`);
  }

  events(after: number): Promise<TransportResponse<EventsResponse>> {
    return this.transport.request('GET', `/api/events?after=${after}`);
  }

  createIncident(
    mutationId: string,
    body: CreateIncidentBody,
  ): Promise<TransportResponse<IncidentResponse>> {
    return this.transport.request('POST', '/api/incidents', { body, idempotencyKey: mutationId });
  }

  updateIncident(
    mutationId: string,
    id: string,
    baseVersion: number,
    changes: IncidentChanges,
  ): Promise<TransportResponse<IncidentResponse>> {
    return this.transport.request('PATCH', `/api/incidents/${id}`, {
      body: { baseVersion, changes },
      idempotencyKey: mutationId,
    });
  }

  deleteIncident(
    mutationId: string,
    id: string,
    baseVersion: number,
  ): Promise<TransportResponse<DeleteIncidentResponse>> {
    return this.transport.request('DELETE', `/api/incidents/${id}?baseVersion=${baseVersion}`, {
      idempotencyKey: mutationId,
    });
  }

  remoteEdit(incidentId?: string): Promise<TransportResponse<RemoteEditResponse>> {
    return this.transport.request('POST', '/api/demo/remote-edit', {
      body: incidentId ? { incidentId } : {},
      kind: 'data',
    });
  }

  resetSession(): Promise<TransportResponse<{ cursor: number }>> {
    return this.transport.request('POST', '/api/demo/reset', { body: {}, kind: 'data' });
  }
}
