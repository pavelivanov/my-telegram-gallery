import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { UseRateLimit } from '../security/rate-limit';
import { ConnectTenantBotDto } from './tenant-bots.dto';
import { TenantBotsService } from './tenant-bots.service';

@Controller('tenants/:slug/bot')
@UseGuards(TgInitDataGuard, ThrottlerGuard)
export class TenantBotsController {
  constructor(private readonly tenantBots: TenantBotsService) {}

  @Get()
  get(@Req() request: TgRequest, @Param('slug') slug: string) {
    return this.tenantBots.getStatus(request.tgAuth!, slug);
  }

  @Put()
  @UseRateLimit('admin')
  connect(
    @Req() request: TgRequest,
    @Param('slug') slug: string,
    @Body() dto: ConnectTenantBotDto,
  ) {
    return this.tenantBots.connect(request.tgAuth!, slug, dto);
  }

  @Delete()
  @UseRateLimit('admin')
  disconnect(@Req() request: TgRequest, @Param('slug') slug: string) {
    return this.tenantBots.disconnect(request.tgAuth!, slug);
  }
}
