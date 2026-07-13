import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { requireTenantContext, type TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { UseRateLimit } from '../security/rate-limit';
import { TenantContextGuard } from './tenant-context.guard';
import {
  AddTenantAdminDto,
  CreateTenantDto,
  UpdateTenantThemeDto,
} from './tenants.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(TgInitDataGuard, ThrottlerGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@Req() request: TgRequest) {
    return this.tenants.listAccessible(request.tgAuth!.user);
  }

  @Get('presentation')
  @UseGuards(TenantContextGuard)
  presentation(@Req() request: TgRequest) {
    return this.tenants.getPresentation(requireTenantContext(request));
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

  @Put(':slug/theme')
  @UseRateLimit('admin')
  updateTheme(
    @Req() request: TgRequest,
    @Param('slug') slug: string,
    @Body() dto: UpdateTenantThemeDto,
  ) {
    return this.tenants.updateTheme(request.tgAuth!.user, slug, dto.theme);
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
