import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = config.get<readonly string[]>('WEB_ORIGINS') ?? [];

  app.setGlobalPrefix('api');
  app.enableCors({ origin: origins.length > 0 ? [...origins] : false });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
