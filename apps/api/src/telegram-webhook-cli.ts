import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { authenticateOperator } from './ops/operator-auth';
import { TelegramApiService } from './telegram/telegram-api.service';
import { redactErrorText } from './security/redaction';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function webhookUrl(args: readonly string[]): string {
  const value = valueAfter(args, '--url');
  if (!value) throw new Error('--url is required');
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !parsed.pathname.endsWith('/api/telegram/webhook')
    ) {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error(
      '--url must be an HTTPS URL ending in /api/telegram/webhook without credentials or query data',
    );
  }
}

async function runWebhookCommand(): Promise<void> {
  const args = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const config = app.get(ConfigService);
    const actor = authenticateOperator(config);
    const telegram = app.get(TelegramApiService);
    const action = args[0];
    const dropPending = args.includes('--drop-pending');
    let result: unknown;
    if (action === 'status') {
      const info = await telegram.getWebhookInfo();
      result = {
        actor,
        testMode: config.getOrThrow<boolean>('TELEGRAM_BOT_API_TEST_MODE'),
        url: info.url
          ? new URL(info.url).origin + new URL(info.url).pathname
          : '',
        pendingUpdateCount: info.pending_update_count,
        lastErrorDate: info.last_error_date ?? null,
        lastErrorMessage: info.last_error_message
          ? redactErrorText(info.last_error_message, config).slice(0, 200)
          : null,
        allowedUpdates: info.allowed_updates ?? [],
      };
    } else if (action === 'set') {
      const secret = config.get<string>('TELEGRAM_WEBHOOK_SECRET');
      if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET is required');
      result = {
        actor,
        testMode: config.getOrThrow<boolean>('TELEGRAM_BOT_API_TEST_MODE'),
        configured: await telegram.setWebhook(
          webhookUrl(args),
          secret,
          dropPending,
        ),
        droppedPendingUpdates: dropPending,
      };
    } else if (action === 'delete') {
      result = {
        actor,
        testMode: config.getOrThrow<boolean>('TELEGRAM_BOT_API_TEST_MODE'),
        deleted: await telegram.deleteWebhook(dropPending),
        droppedPendingUpdates: dropPending,
      };
    } else {
      throw new Error('Use status, set --url HTTPS_URL, or delete');
    }
    console.info(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void runWebhookCommand().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Webhook command failed',
  );
  process.exitCode = 1;
});
