import type { FastifyInstance } from 'fastify';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);

    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.error,
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Unexpected server error.',
    });
  });
}
