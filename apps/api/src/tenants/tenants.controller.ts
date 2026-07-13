import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { CreateTenantDto } from './tenants.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(TgInitDataGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@Req() request: TgRequest) {
    return this.tenants.listOwned(request.tgAuth!.user);
  }

  @Post()
  create(@Req() request: TgRequest, @Body() dto: CreateTenantDto) {
    return this.tenants.create(request.tgAuth!.user, dto.name, dto.slug);
  }

  @Get(':slug')
  get(@Req() request: TgRequest, @Param('slug') slug: string) {
    return this.tenants.getOwned(request.tgAuth!.user, slug);
  }
}
