import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  TelegramUpdateStatus,
  type TelegramUpdate,
} from '../../generated/prisma/client';
import {
  PermanentBillingEventError,
  RetryableBillingEventError,
} from '../billing/billing.errors';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelegramApiError,
  TelegramApiService,
} from '../telegram/telegram-api.service';
import type { TelegramUpdatePayload } from '../telegram/telegram.types';

const PROCESSING_STALE_MS = 30_000;

type ClaimResult =
  | { kind: 'claimed'; record: TelegramUpdate }
  | { kind: 'duplicate' }
  | { kind: 'busy' };

function eventType(update: Partial<TelegramUpdatePayload>): string {
  if (update.pre_checkout_query) return 'pre_checkout_query';
  if (update.message?.successful_payment) return 'successful_payment';
  const text = update.message?.text;
  if (
    typeof text === 'string' &&
    /^\/paysupport(?:@\w+)?(?:\s|$)/i.test(text)
  ) {
    return 'paysupport';
  }
  if (typeof text === 'string' && /^\/terms(?:@\w+)?(?:\s|$)/i.test(text)) {
    return 'terms';
  }
  return 'ignored';
}

function safeSummary(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 200);
}

function parseUpdateId(value: unknown): bigint | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return undefined;
  }
  return BigInt(value);
}

@Injectable()
export class TelegramWebhookService {
  private readonly privacyUrl?: string;
  private readonly supportContact?: string;
  private readonly termsUrl?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly telegram: TelegramApiService,
    config: ConfigService,
  ) {
    this.privacyUrl = config.get<string>('BILLING_PRIVACY_URL');
    this.supportContact = config.get<string>('PAY_SUPPORT_CONTACT');
    this.termsUrl = config.get<string>('BILLING_TERMS_URL');
  }

  async process(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      await this.recordMalformed('invalid top-level webhook body');
      return { status: 'rejected' };
    }
    const update = raw as Partial<TelegramUpdatePayload>;
    const updateId = parseUpdateId(update.update_id);
    if (updateId === undefined) {
      await this.recordMalformed('missing or invalid update_id');
      return { status: 'rejected' };
    }
    const type = eventType(update);
    const claim = await this.claim(updateId, type);
    if (claim.kind === 'duplicate') return { status: 'duplicate' };
    if (claim.kind === 'busy') {
      throw new ServiceUnavailableException('Webhook update is processing');
    }

    try {
      if (type === 'pre_checkout_query') {
        await this.billing.handlePreCheckout(update.pre_checkout_query!);
      } else if (type === 'successful_payment') {
        await this.billing.applySuccessfulPayment(
          update.message!,
          claim.record.id,
        );
      } else if (type === 'paysupport') {
        await this.answerPaySupport(update);
      } else if (type === 'terms') {
        await this.answerTerms(update);
      }
      await this.finish(claim.record.id, TelegramUpdateStatus.PROCESSED);
      return { status: type === 'ignored' ? 'ignored' : 'processed' };
    } catch (error) {
      if (error instanceof PermanentBillingEventError) {
        await this.finish(
          claim.record.id,
          TelegramUpdateStatus.REJECTED,
          error.summary,
        );
        return { status: 'rejected' };
      }
      const summary =
        error instanceof RetryableBillingEventError
          ? error.summary
          : error instanceof TelegramApiError
            ? `Telegram ${error.method} failed`
            : 'internal webhook processing failure';
      await this.finish(
        claim.record.id,
        TelegramUpdateStatus.RETRYABLE,
        summary,
      );
      throw new ServiceUnavailableException('Webhook processing will retry');
    }
  }

  private async claim(updateId: bigint, type: string): Promise<ClaimResult> {
    try {
      const record = await this.prisma.telegramUpdate.create({
        data: { updateId, type },
      });
      return { kind: 'claimed', record };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "TelegramUpdate" WHERE "updateId" = ${updateId} FOR UPDATE`,
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Telegram update conflict without row');
      const existing = await transaction.telegramUpdate.findUniqueOrThrow({
        where: { id },
      });
      if (
        existing.status === TelegramUpdateStatus.PROCESSED ||
        existing.status === TelegramUpdateStatus.REJECTED
      ) {
        return { kind: 'duplicate' };
      }
      if (
        existing.status === TelegramUpdateStatus.PROCESSING &&
        existing.updatedAt.getTime() > Date.now() - PROCESSING_STALE_MS
      ) {
        return { kind: 'busy' };
      }
      const record = await transaction.telegramUpdate.update({
        where: { id },
        data: {
          type,
          status: TelegramUpdateStatus.PROCESSING,
          attempts: { increment: 1 },
          errorSummary: null,
          processedAt: null,
        },
      });
      return { kind: 'claimed', record };
    });
  }

  private async finish(
    id: string,
    status: TelegramUpdateStatus,
    errorSummary?: string,
  ): Promise<void> {
    await this.prisma.telegramUpdate.update({
      where: { id },
      data: {
        status,
        errorSummary: errorSummary ? safeSummary(errorSummary) : null,
        processedAt:
          status === TelegramUpdateStatus.PROCESSED ||
          status === TelegramUpdateStatus.REJECTED
            ? new Date()
            : null,
      },
    });
  }

  private async recordMalformed(summary: string): Promise<void> {
    await this.prisma.telegramUpdate.create({
      data: {
        type: 'invalid',
        status: TelegramUpdateStatus.REJECTED,
        errorSummary: safeSummary(summary),
        processedAt: new Date(),
      },
    });
  }

  private async answerPaySupport(
    update: Partial<TelegramUpdatePayload>,
  ): Promise<void> {
    const chatId = update.message?.chat?.id;
    if (typeof chatId !== 'number' || !Number.isSafeInteger(chatId)) {
      throw new PermanentBillingEventError('invalid paysupport chat');
    }
    const contact =
      this.supportContact ?? 'the service operator listed in the gallery';
    await this.telegram.sendMessage(
      chatId,
      `Payment support: ${contact}\n\nInclude your gallery address and the request ID shown by the app. Never send bot tokens, Telegram init data, passwords, or payment credentials. Telegram Support cannot resolve purchases made through this gallery service.`,
    );
  }

  private async answerTerms(
    update: Partial<TelegramUpdatePayload>,
  ): Promise<void> {
    const chatId = update.message?.chat?.id;
    if (typeof chatId !== 'number' || !Number.isSafeInteger(chatId)) {
      throw new PermanentBillingEventError('invalid terms chat');
    }
    const text = this.termsUrl
      ? `Terms: ${this.termsUrl}${this.privacyUrl ? `\nPrivacy: ${this.privacyUrl}` : ''}`
      : 'Paid subscriptions are not configured for this gallery service.';
    await this.telegram.sendMessage(chatId, text);
  }
}
