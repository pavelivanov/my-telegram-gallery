import type { Event } from '@sentry/nestjs';
import { createSentryOptions, scrubSentryEvent } from './sentry';

describe('Sentry monitoring', () => {
  it('stays disabled without a valid configured DSN', () => {
    expect(createSentryOptions({})).toBeUndefined();
    expect(
      createSentryOptions({ SENTRY_DSN: 'http://public@example.com/1' }),
    ).toBeUndefined();
  });

  it('uses error-only, privacy-preserving defaults', () => {
    const options = createSentryOptions({
      SENTRY_DSN: 'https://public@example.com/42',
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_RELEASE: 'gallery@abc123',
      SENTRY_TRACES_SAMPLE_RATE: '0.25',
    });

    expect(options).toMatchObject({
      dsn: 'https://public@example.com/42',
      environment: 'staging',
      release: 'gallery@abc123',
      sendDefaultPii: false,
      enableLogs: false,
      maxBreadcrumbs: 0,
      tracesSampleRate: 0.25,
    });
    expect(options?.beforeSend).toBeInstanceOf(Function);
    expect(options?.beforeSendTransaction).toBeInstanceOf(Function);
  });

  it('removes request and identity data and redacts secrets everywhere else', () => {
    const configuredSecret = 'configured-secret-value';
    const event: Event = {
      message: `Failed with ${configuredSecret}`,
      exception: {
        values: [
          {
            type: 'Error',
            value: 'authorization=tma-secret invoice_payload=checkout-secret',
          },
        ],
      },
      request: {
        method: 'POST',
        url: 'https://gallery.example/api/albums?signature=signed-value#debug',
        headers: { authorization: 'tma request-secret' },
        cookies: { session: 'cookie-secret' },
        data: 'init_data=raw-telegram-secret',
        query_string: 'signature=signed-value',
      },
      user: { id: 'telegram-user-123' },
      breadcrumbs: [{ message: 'private-navigation-detail' }],
      extra: {
        nested: `${configuredSecret} telegram_payment_charge_id=charge-secret`,
        botToken: 'structured-bot-secret',
        TENANT_BOT_ENCRYPTION_KEYS: 'structured-key-secret',
      },
    };

    const scrubbed = scrubSentryEvent(event, [configuredSecret]);
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://gallery.example/api/albums',
    });
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    for (const secret of [
      configuredSecret,
      'tma-secret',
      'checkout-secret',
      'charge-secret',
      'signed-value',
      'request-secret',
      'cookie-secret',
      'raw-telegram-secret',
      'telegram-user-123',
      'private-navigation-detail',
      'structured-bot-secret',
      'structured-key-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('[REDACTED]');
  });
});
