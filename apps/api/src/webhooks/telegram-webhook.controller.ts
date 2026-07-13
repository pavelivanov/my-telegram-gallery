import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UseRateLimit } from '../security/rate-limit';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramWebhookService } from './telegram-webhook.service';

@Controller('telegram/webhook')
@UseGuards(TelegramWebhookGuard, ThrottlerGuard)
@UseRateLimit('webhook')
export class TelegramWebhookController {
  constructor(private readonly webhooks: TelegramWebhookService) {}

  @Post()
  @HttpCode(200)
  receive(@Body() update: unknown) {
    return this.webhooks.process(update);
  }
}
