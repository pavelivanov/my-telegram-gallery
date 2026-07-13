import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { TgRequest } from '../auth/request-context';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const logger = new Logger('HttpRequest');

export function requestContextMiddleware(
  request: TgRequest,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header('X-Request-Id');
  request.requestId =
    incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  response.setHeader('X-Request-Id', request.requestId);
  const startedAt = Date.now();
  response.on('finish', () => {
    logger.log(
      JSON.stringify({
        event: 'http_request',
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        tenantId: request.tenantContext?.id,
        tgUserId: request.tgAuth?.user.id
          ? String(request.tgAuth.user.id)
          : undefined,
      }),
    );
  });
  next();
}
