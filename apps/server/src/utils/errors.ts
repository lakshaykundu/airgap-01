import type { ApiErrorBody, ErrorCode } from '@airgap/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export function validationError(error: ZodError): ApiError {
  return new ApiError(
    400,
    'VALIDATION_FAILED',
    'Request validation failed',
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

/** Parses with a Zod schema and converts failures to structured 400 responses. */
export function parseOrThrow<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw validationError(error);
    throw error;
  }
}

/** Uniform error responses; never leaks stack traces to clients. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ApiError | Error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(error.toBody());
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(validationError(error).toBody());
    }
    const fastifyError = error as FastifyError;
    if (fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .status(413)
        .send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    }
    if (fastifyError.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'Rate limit reached. Slow down.' } });
    }
    if (
      fastifyError.statusCode &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      return reply.status(fastifyError.statusCode).send({
        error: { code: 'VALIDATION_FAILED', message: fastifyError.message },
      });
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });
}
