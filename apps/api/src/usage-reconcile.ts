import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { parseBoundedJobOptions } from './usage/job-options';
import {
  type TenantUsageReconciliation,
  UsageService,
} from './usage/usage.service';

async function reconcileUsage(): Promise<void> {
  const options = parseBoundedJobOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const usage = app.get(UsageService);
    const tenants = await prisma.tenant.findMany({
      where: options.tenantSlug ? { slug: options.tenantSlug } : undefined,
      orderBy: { id: 'asc' },
      take: options.tenantSlug ? 1 : options.limit,
      select: { id: true, slug: true },
    });
    if (options.tenantSlug && tenants.length === 0) {
      throw new Error(`Tenant not found: ${options.tenantSlug}`);
    }
    const results: TenantUsageReconciliation[] = [];
    for (const tenant of tenants) {
      results.push(
        await usage.reconcileTenant(tenant.id, {
          apply: options.apply,
          limit: options.limit,
        }),
      );
    }
    console.info(
      JSON.stringify({
        mode: options.apply ? 'apply' : 'dry-run',
        processedTenants: results.length,
        driftedTenants: results.filter((result) => result.drift).length,
        results,
      }),
    );
    if (results.some((result) => result.incomplete || result.issues.length)) {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

void reconcileUsage().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Usage reconcile failed',
  );
  process.exitCode = 1;
});
