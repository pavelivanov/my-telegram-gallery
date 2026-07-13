import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramWebhookGuard } from './telegram-webhook.guard';

const SECRET = 'webhook_secret_with_at_least_32_characters';

function context(value?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: value ? { 'x-telegram-bot-api-secret-token': value } : {},
      }),
    }),
  } as ExecutionContext;
}

describe('TelegramWebhookGuard', () => {
  const guard = new TelegramWebhookGuard(
    new ConfigService({ TELEGRAM_WEBHOOK_SECRET: SECRET }),
  );

  it('accepts only the configured secret', () => {
    expect(guard.canActivate(context(SECRET))).toBe(true);
    expect(() => guard.canActivate(context('x'.repeat(SECRET.length)))).toThrow(
      'Invalid Telegram webhook',
    );
    expect(() => guard.canActivate(context())).toThrow(
      'Invalid Telegram webhook',
    );
  });

  it('fails closed when billing webhook configuration is absent', () => {
    const disabled = new TelegramWebhookGuard(new ConfigService({}));
    expect(() => disabled.canActivate(context(SECRET))).toThrow(
      'Invalid Telegram webhook',
    );
  });
});
