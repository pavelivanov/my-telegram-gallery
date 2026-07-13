import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramWebhookGuard } from './telegram-webhook.guard';
import { TelegramWebhookService } from './telegram-webhook.service';

@Module({
  imports: [BillingModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramWebhookGuard, TelegramWebhookService],
})
export class WebhooksModule {}
