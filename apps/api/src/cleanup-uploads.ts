import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { TenancyMode } from './config/env';
import { PhotosService } from './photos/photos.service';
import { PrismaService } from './prisma/prisma.service';

async function cleanupUploads(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const photos = app.get(PhotosService);
    const mode = app.get(ConfigService).getOrThrow<TenancyMode>('TENANCY_MODE');
    const tenants = await prisma.tenant.findMany({
      select: { id: true, slug: true, status: true },
    });
    const totals = { processed: 0, expired: 0, failed: 0 };
    for (const tenant of tenants) {
      const result = await photos.cleanupExpiredUploads({ ...tenant, mode });
      totals.processed += result.processed;
      totals.expired += result.expired;
      totals.failed += result.failed;
    }
    console.info(JSON.stringify(totals));
  } finally {
    await app.close();
  }
}

void cleanupUploads().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
