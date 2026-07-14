import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramWebhookInfo } from './telegram.types';

const SUBSCRIPTION_PERIOD_SECONDS = 2_592_000;

interface BotApiResponse<T> {
  error_code?: number;
  ok: boolean;
  result?: T;
}

interface TelegramBotIdentity {
  id: number;
  is_bot: boolean;
  username?: string;
}

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(`Telegram Bot API ${method} failed`);
    this.name = 'TelegramApiError';
  }
}

@Injectable()
export class TelegramApiService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const token = config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const testPath = config.getOrThrow<boolean>('TELEGRAM_BOT_API_TEST_MODE')
      ? '/test'
      : '';
    this.baseUrl = `https://api.telegram.org/bot${token}${testPath}`;
    this.timeoutMs = config.getOrThrow<number>('TELEGRAM_BOT_API_TIMEOUT_MS');
  }

  createInvoiceLink(input: {
    amountStars: number;
    payload: string;
  }): Promise<string> {
    return this.call<string>('createInvoiceLink', {
      title: 'Gallery Pro',
      description:
        'Higher gallery, photo, storage, and upload limits for 30 days.',
      payload: input.payload,
      currency: 'XTR',
      prices: [{ label: 'Gallery Pro monthly', amount: input.amountStars }],
      subscription_period: SUBSCRIPTION_PERIOD_SECONDS,
    });
  }

  answerPreCheckoutQuery(
    input: {
      id: string;
      ok: boolean;
      errorMessage?: string;
    },
    options: { timeoutMs?: number } = {},
  ): Promise<boolean> {
    return this.call<boolean>(
      'answerPreCheckoutQuery',
      {
        pre_checkout_query_id: input.id,
        ok: input.ok,
        ...(input.ok ? {} : { error_message: input.errorMessage }),
      },
      options.timeoutMs,
    );
  }

  editUserStarSubscription(input: {
    payerTgUserId: bigint;
    telegramPaymentChargeId: string;
    canceled: boolean;
  }): Promise<boolean> {
    return this.call<boolean>('editUserStarSubscription', {
      user_id: input.payerTgUserId.toString(),
      telegram_payment_charge_id: input.telegramPaymentChargeId,
      is_canceled: input.canceled,
    });
  }

  refundStarPayment(input: {
    payerTgUserId: bigint;
    telegramPaymentChargeId: string;
  }): Promise<boolean> {
    return this.call<boolean>('refundStarPayment', {
      user_id: input.payerTgUserId.toString(),
      telegram_payment_charge_id: input.telegramPaymentChargeId,
    });
  }

  sendMessage(chatId: number, text: string): Promise<unknown> {
    return this.call('sendMessage', { chat_id: chatId, text });
  }

  setWebhook(url: string, secretToken: string, dropPending: boolean) {
    return this.call<boolean>('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'pre_checkout_query'],
      drop_pending_updates: dropPending,
    });
  }

  getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.call<TelegramWebhookInfo>('getWebhookInfo', {});
  }

  deleteWebhook(dropPending: boolean): Promise<boolean> {
    return this.call<boolean>('deleteWebhook', {
      drop_pending_updates: dropPending,
    });
  }

  async verifyBotToken(token: string): Promise<{
    id: bigint;
    username: string;
  }> {
    const result = await this.callAtBase<TelegramBotIdentity>(
      `https://api.telegram.org/bot${token}`,
      'getMe',
      {},
    );
    if (
      !result.is_bot ||
      !Number.isSafeInteger(result.id) ||
      result.id <= 0 ||
      !result.username ||
      !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(result.username) ||
      !result.username.toLowerCase().endsWith('bot')
    ) {
      throw new TelegramApiError('getMe', false, 200);
    }
    return { id: BigInt(result.id), username: result.username };
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    timeoutOverrideMs?: number,
  ): Promise<T> {
    return this.callAtBase(this.baseUrl, method, body, timeoutOverrideMs);
  }

  private async callAtBase<T>(
    baseUrl: string,
    method: string,
    body: Record<string, unknown>,
    timeoutOverrideMs?: number,
  ): Promise<T> {
    const timeoutMs = Math.min(
      this.timeoutMs,
      timeoutOverrideMs ?? this.timeoutMs,
    );
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TelegramApiError(method, true);
    }

    let payload: BotApiResponse<T> | undefined;
    try {
      payload = (await response.json()) as BotApiResponse<T>;
    } catch {
      // Telegram normally returns JSON. Treat proxy/HTML responses as transient.
    }
    if (!response.ok || !payload?.ok || payload.result === undefined) {
      throw new TelegramApiError(
        method,
        response.status === 429 ||
          response.status >= 500 ||
          payload?.error_code === 429 ||
          (payload?.error_code !== undefined && payload.error_code >= 500) ||
          !payload,
        response.status,
      );
    }
    return payload.result;
  }
}

export { SUBSCRIPTION_PERIOD_SECONDS };
