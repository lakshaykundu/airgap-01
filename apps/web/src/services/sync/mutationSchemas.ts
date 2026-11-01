import { createIncidentBodySchema, incidentChangesSchema } from '@airgap/shared';
import { z } from 'zod';
import type { MutationType } from '../../database/db';

/**
 * Runtime validation of queued payloads. Payloads are read back from IndexedDB,
 * which may hold data written by an older build, so they are re-validated
 * before they are sent rather than trusted blindly.
 */
export const mutationPayloadSchemas = {
  CREATE_INCIDENT: createIncidentBodySchema,
  UPDATE_INCIDENT: z.object({ changes: incidentChangesSchema }),
  DELETE_INCIDENT: z.object({}),
} satisfies Record<MutationType, z.ZodType>;
