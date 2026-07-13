import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  json,
  urlencoded,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { TgRequest } from './auth/request-context';
import { requestContextMiddleware } from './security/request-context.middleware';
import { SafeExceptionFilter } from './security/safe-exception.filter';

function safeBodyParser(parser: RequestHandler): RequestHandler {
  return (request: TgRequest, response: Response, next: NextFunction) => {
    parser(request, response, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }
      const tooLarge =
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large';
      const statusCode = tooLarge ? 413 : 400;
      response.status(statusCode).json({
        statusCode,
        error: tooLarge ? 'Payload Too Large' : 'Bad Request',
        code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_BODY',
        message: tooLarge
          ? 'The request body is too large.'
          : 'The request body is invalid.',
        requestId: request.requestId,
      });
    });
  };
}

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = config.get<readonly string[]>('WEB_ORIGINS') ?? [];
  const jsonBodyLimit = config.getOrThrow<number>('JSON_BODY_LIMIT_BYTES');
  const telegramWebhookBodyLimit = config.getOrThrow<number>(
    'TELEGRAM_WEBHOOK_BODY_LIMIT_BYTES',
  );
  const trustProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  const express = app.getHttpAdapter().getInstance() as Express;

  express.set('trust proxy', trustProxyHops === 0 ? false : trustProxyHops);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: origins.length > 0 ? [...origins] : false });
  app.use(requestContextMiddleware);
  app.use(
    '/api/telegram/webhook',
    safeBodyParser(json({ limit: telegramWebhookBodyLimit })),
  );
  app.use(safeBodyParser(json({ limit: jsonBodyLimit })));
  app.use(
    safeBodyParser(urlencoded({ extended: false, limit: jsonBodyLimit })),
  );
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    next();
  });
  app.useGlobalFilters(new SafeExceptionFilter(config));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
