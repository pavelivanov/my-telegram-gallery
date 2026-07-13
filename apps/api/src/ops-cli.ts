import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { authenticateOperator } from './ops/operator-auth';
import { OpsService } from './ops/ops.service';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function boundedLimit(args: readonly string[]): number {
  const raw = valueAfter(args, '--limit') ?? '50';
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('--limit must be an integer from 1 to 500');
  }
  return limit;
}

function required(
  args: readonly string[],
  flag: string,
  maxLength: number,
): string {
  const value = valueAfter(args, flag)?.trim();
  if (!value || value.length > maxLength) {
    throw new Error(
      `${flag} is required and must be at most ${maxLength} characters`,
    );
  }
  return value;
}

async function runOps(): Promise<void> {
  const args = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const actor = authenticateOperator(app.get(ConfigService));
    const ops = app.get(OpsService);
    const [resource, action] = args;
    let result: unknown;
    if (resource === 'reports' && action === 'list') {
      result = await ops.listOpenReports(boundedLimit(args));
    } else if (resource === 'tenant' && action === 'inspect') {
      result = await ops.inspectTenant(required(args, '--tenant', 32));
    } else if (
      resource === 'tenant' &&
      (action === 'suspend' || action === 'unsuspend')
    ) {
      result = await ops.setTenantSuspension(
        required(args, '--tenant', 32),
        action === 'suspend',
        actor,
        required(args, '--reason', 500),
      );
    } else if (
      resource === 'report' &&
      (action === 'resolve' || action === 'dismiss')
    ) {
      result = await ops.closeReport(
        required(args, '--report', 64),
        action === 'resolve' ? 'resolved' : 'dismissed',
        actor,
        required(args, '--note', 500),
      );
    } else {
      throw new Error('Unknown operator command');
    }
    console.info(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void runOps().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Operator command failed',
  );
  process.exitCode = 1;
});
