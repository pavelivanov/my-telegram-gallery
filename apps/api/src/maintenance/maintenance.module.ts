import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PhotosModule } from '../photos/photos.module';
import { UsageModule } from '../usage/usage.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [BillingModule, PhotosModule, UsageModule],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
