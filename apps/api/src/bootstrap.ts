import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = config.get<readonly string[]>('WEB_ORIGINS') ?? [];

  app.setGlobalPrefix('api');
  app.enableCors({ origin: origins.length > 0 ? [...origins] : false });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
