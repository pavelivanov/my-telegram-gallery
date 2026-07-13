import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { AddTenantAdminDto, CreateTenantDto } from './tenants.dto';
import { UseRateLimit } from '../security/rate-limit';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(TgInitDataGuard, ThrottlerGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@Req() request: TgRequest) {
    return this.tenants.listAccessible(request.tgAuth!.user);
  }

  @Post()
  @UseRateLimit('admin')
  create(@Req() request: TgRequest, @Body() dto: CreateTenantDto) {
    return this.tenants.create(request.tgAuth!.user, dto.name, dto.slug);
  }

  @Get(':slug')
  get(@Req() request: TgRequest, @Param('slug') slug: string) {
    return this.tenants.getAccessible(request.tgAuth!.user, slug);
  }

  @Get(':slug/members')
  listMembers(@Req() request: TgRequest, @Param('slug') slug: string) {
    return this.tenants.listMembers(request.tgAuth!.user, slug);
  }

  @Post(':slug/members')
  @UseRateLimit('admin')
  addMember(
    @Req() request: TgRequest,
    @Param('slug') slug: string,
    @Body() dto: AddTenantAdminDto,
  ) {
    return this.tenants.addAdmin(request.tgAuth!.user, slug, dto.tgUserId);
  }

  @Delete(':slug/members/:tgUserId')
  @UseRateLimit('admin')
  removeMember(
    @Req() request: TgRequest,
    @Param('slug') slug: string,
    @Param('tgUserId') tgUserId: string,
  ) {
    return this.tenants.removeAdmin(request.tgAuth!.user, slug, tgUserId);
  }
}
