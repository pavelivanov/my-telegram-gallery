import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type TgRequest, requireTenantContext } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { UseRateLimit } from '../security/rate-limit';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(TgInitDataGuard, TenantContextGuard, ThrottlerGuard)
@UseRateLimit('admin')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  state(@Req() request: TgRequest) {
    return this.billing.getState(
      requireTenantContext(request),
      request.tgAuth!.user.id,
    );
  }

  @Post('checkout')
  checkout(@Req() request: TgRequest) {
    return this.billing.createCheckout(
      requireTenantContext(request),
      request.tgAuth!.user.id,
    );
  }

  @Post('subscription/cancel')
  cancel(@Req() request: TgRequest) {
    return this.billing.setCancellation(
      requireTenantContext(request),
      request.tgAuth!.user.id,
      true,
    );
  }

  @Post('subscription/re-enable')
  reEnable(@Req() request: TgRequest) {
    return this.billing.setCancellation(
      requireTenantContext(request),
      request.tgAuth!.user.id,
      false,
    );
  }
}
