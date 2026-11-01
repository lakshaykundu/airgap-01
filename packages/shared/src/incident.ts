import { z } from 'zod';
import { SECTOR_IDS } from './topology';

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const STATUSES = ['open', 'investigating', 'resolved'] as const;
export const SYNC_STATUSES = ['synced', 'pending', 'syncing', 'conflict', 'failed'] as const;

export type IncidentSeverity = (typeof SEVERITIES)[number];
export type IncidentStatus = (typeof STATUSES)[number];
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const sectorIdSchema = z.enum(SECTOR_IDS);

/**
 * The user-editable fields of an incident. Shared by the create form, the
 * PATCH body, and the server's validation so both sides agree on the rules.
 */
export const incidentFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(120, 'Title must be at most 120 characters'),
  description: z.string().trim().max(2000, 'Description must be at most 2,000 characters'),
  severity: z.enum(SEVERITIES),
  status: z.enum(STATUSES),
  sectorId: sectorIdSchema,
  assignedTo: z.string().trim().min(1).max(60).nullable(),
});

export type IncidentFields = z.infer<typeof incidentFieldsSchema>;
export const INCIDENT_FIELD_KEYS = Object.keys(
  incidentFieldsSchema.shape,
) as (keyof IncidentFields)[];

const isoDate = z.iso.datetime({ offset: true });

/**
 * Authoritative server representation. `version` is assigned exclusively by the
 * server; the client only ever echoes back the last version it was given.
 */
export const incidentSchema = incidentFieldsSchema.extend({
  id: z.uuid(),
  createdAt: isoDate,
  updatedAt: isoDate,
  version: z.number().int().positive(),
});

export type Incident = z.infer<typeof incidentSchema>;

/** POST /api/incidents body — the client chooses the UUID so offline creates are stable. */
export const createIncidentBodySchema = incidentFieldsSchema.extend({
  id: z.uuid(),
  createdAt: isoDate.optional(),
});
export type CreateIncidentBody = z.infer<typeof createIncidentBodySchema>;

export const incidentChangesSchema = incidentFieldsSchema
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, 'At least one field must change');
export type IncidentChanges = z.infer<typeof incidentChangesSchema>;

/** PATCH /api/incidents/:id body — optimistic concurrency via baseVersion. */
export const updateIncidentBodySchema = z.object({
  baseVersion: z.number().int().positive(),
  changes: incidentChangesSchema,
});
export type UpdateIncidentBody = z.infer<typeof updateIncidentBodySchema>;

/** Human-readable incident code derived from the UUID (no server round trip needed). */
export function incidentCode(id: string): string {
  if (id.startsWith('lt-')) return id.toUpperCase();
  return `INC-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

/** Returns the editable fields whose values differ between two incidents. */
export function diffIncidentFields(a: IncidentFields, b: IncidentFields): (keyof IncidentFields)[] {
  return INCIDENT_FIELD_KEYS.filter((key) => (a[key] ?? null) !== (b[key] ?? null));
}

export function pickIncidentFields(source: IncidentFields): IncidentFields {
  return {
    title: source.title,
    description: source.description,
    severity: source.severity,
    status: source.status,
    sectorId: source.sectorId,
    assignedTo: source.assignedTo ?? null,
  };
}
