import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type TgRequest, requireTenantContext } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { UseRateLimit } from '../security/rate-limit';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { CreateReportDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(TgInitDataGuard, TenantContextGuard, ThrottlerGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @UseRateLimit('report')
  create(@Req() request: TgRequest, @Body() dto: CreateReportDto) {
    return this.reports.create(
      requireTenantContext(request),
      request.tgAuth!.user,
      dto,
    );
  }
}
