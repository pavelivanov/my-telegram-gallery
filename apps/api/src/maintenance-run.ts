import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseMaintenanceOptions } from './maintenance/maintenance-options';
import { MaintenanceService } from './maintenance/maintenance.service';

async function runMaintenance(): Promise<void> {
  const options = parseMaintenanceOptions(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app
      .get(MaintenanceService)
      .run(options.kind, options.limit);
    console.info(JSON.stringify(result));
    if (result.status === 'skipped') {
      process.exitCode = 75;
    } else if (result.attentionRequired) {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

void runMaintenance().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Scheduled maintenance failed',
  );
  process.exitCode = 1;
});
