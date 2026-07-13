import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { OpsService } from './ops.service';

@Module({
  imports: [BillingModule],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
