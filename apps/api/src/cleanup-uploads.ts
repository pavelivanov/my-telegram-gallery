import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { TenancyMode } from './config/env';
import { PhotosService } from './photos/photos.service';
import { PrismaService } from './prisma/prisma.service';
import { parseBoundedJobOptions } from './usage/job-options';

async function cleanupUploads(): Promise<void> {
  const options = parseBoundedJobOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const photos = app.get(PhotosService);
    const mode = app.get(ConfigService).getOrThrow<TenancyMode>('TENANCY_MODE');
    const tenants = await prisma.tenant.findMany({
      where: options.tenantSlug ? { slug: options.tenantSlug } : undefined,
      orderBy: { id: 'asc' },
      take: options.tenantSlug ? 1 : options.limit,
      select: { id: true, name: true, slug: true, status: true, theme: true },
    });
    if (options.tenantSlug && tenants.length === 0) {
      throw new Error(`Tenant not found: ${options.tenantSlug}`);
    }
    const totals = {
      mode: options.apply ? 'apply' : 'dry-run',
      processed: 0,
      expired: 0,
      failed: 0,
      candidates: [] as string[],
    };
    for (const tenant of tenants) {
      const result = await photos.cleanupExpiredUploads(
        { ...tenant, bot: null, mode },
        { dryRun: options.dryRun, limit: options.limit },
      );
      totals.processed += result.processed;
      totals.expired += result.expired;
      totals.failed += result.failed;
      totals.candidates.push(...result.candidates);
    }
    console.info(JSON.stringify(totals));
  } finally {
    await app.close();
  }
}

void cleanupUploads().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Upload cleanup failed',
  );
  process.exitCode = 1;
});
