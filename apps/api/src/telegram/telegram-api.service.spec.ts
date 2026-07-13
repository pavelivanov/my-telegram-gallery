import { ConfigService } from '@nestjs/config';
import { TelegramApiError, TelegramApiService } from './telegram-api.service';

function service(testMode = true) {
  return new TelegramApiService(
    new ConfigService({
      TELEGRAM_BOT_TOKEN: '123456:test-secret-token',
      TELEGRAM_BOT_API_TEST_MODE: testMode,
      TELEGRAM_BOT_API_TIMEOUT_MS: 1000,
    }),
  );
}

function successful<T>(result: T): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.toString() : input.url;
}

function jsonRequestBody(
  init: RequestInit | undefined,
): Record<string, unknown> {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body');
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('TelegramApiService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates the exact recurring Stars invoice without a provider token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successful('https://t.me/$invoice_slug'));

    await expect(
      service().createInvoiceLink({ amountStars: 250, payload: 'checkout_1' }),
    ).resolves.toBe('https://t.me/$invoice_slug');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(requestUrl(url)).toBe(
      'https://api.telegram.org/bot123456:test-secret-token/test/createInvoiceLink',
    );
    const body = jsonRequestBody(init);
    expect(body).toEqual({
      title: 'Gallery Pro',
      description:
        'Higher gallery, photo, storage, and upload limits for 30 days.',
      payload: 'checkout_1',
      currency: 'XTR',
      prices: [{ label: 'Gallery Pro monthly', amount: 250 }],
      subscription_period: 2_592_000,
    });
    expect(body).not.toHaveProperty('provider_token');
  });

  it('uses charge IDs for cancel, re-enable, and refund', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(successful(true)));
    const telegram = service(false);

    await telegram.editUserStarSubscription({
      payerTgUserId: 42n,
      telegramPaymentChargeId: 'charge_1',
      canceled: true,
    });
    await telegram.refundStarPayment({
      payerTgUserId: 42n,
      telegramPaymentChargeId: 'charge_1',
    });

    expect(fetchMock.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      'https://api.telegram.org/bot123456:test-secret-token/editUserStarSubscription',
      'https://api.telegram.org/bot123456:test-secret-token/refundStarPayment',
    ]);
    expect(jsonRequestBody(fetchMock.mock.calls[0][1])).toEqual({
      user_id: '42',
      telegram_payment_charge_id: 'charge_1',
      is_canceled: true,
    });
  });

  it('classifies timeouts and server failures as retryable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network'));
    await expect(
      service().answerPreCheckoutQuery({ id: 'pre_1', ok: true }),
    ).rejects.toMatchObject<TelegramApiError>({ retryable: true });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      service().answerPreCheckoutQuery({ id: 'pre_2', ok: false }),
    ).rejects.toMatchObject<TelegramApiError>({
      retryable: false,
      statusCode: 400,
    });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error_code: 429 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      service().answerPreCheckoutQuery({ id: 'pre_3', ok: true }),
    ).rejects.toMatchObject<TelegramApiError>({ retryable: true });
  });
});
