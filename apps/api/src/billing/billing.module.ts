import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { BillingAccessService } from './billing-access.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementService } from './entitlement.service';

@Module({
  imports: [TelegramModule],
  controllers: [BillingController],
  providers: [BillingAccessService, BillingService, EntitlementService],
  exports: [BillingAccessService, BillingService, EntitlementService],
})
export class BillingModule {}
