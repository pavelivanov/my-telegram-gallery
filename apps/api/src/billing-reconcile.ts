import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BillingService } from './billing/billing.service';

function parseOptions(args: readonly string[]) {
  let limit = 100;
  let tenantSlug: string | undefined;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--limit') {
      limit = Number(args[++index]);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
        throw new Error('--limit must be an integer from 1 to 10000');
      }
    } else if (args[index] === '--tenant') {
      tenantSlug = args[++index];
      if (!tenantSlug || !/^[a-z0-9_]{3,32}$/.test(tenantSlug)) {
        throw new Error('--tenant must be a valid tenant slug');
      }
    } else {
      throw new Error(`Unknown option: ${args[index]}`);
    }
  }
  return { limit, tenantSlug };
}

async function reconcileBilling(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app
      .get(BillingService)
      .reconcile(options.limit, options.tenantSlug);
    console.info(JSON.stringify(result));
    if (result.discrepancies > 0 || result.incomplete) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

void reconcileBilling().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Billing reconciliation failed',
  );
  process.exitCode = 1;
});
