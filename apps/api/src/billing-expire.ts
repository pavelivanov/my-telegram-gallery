import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BillingService } from './billing/billing.service';
import { parseBoundedJobOptions } from './usage/job-options';

async function expireBilling(): Promise<void> {
  const options = parseBoundedJobOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app.get(BillingService).expire({
      dryRun: options.dryRun,
      limit: options.limit,
      tenantSlug: options.tenantSlug,
    });
    console.info(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void expireBilling().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Billing expiry failed',
  );
  process.exitCode = 1;
});
