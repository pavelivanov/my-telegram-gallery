import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { requireTenantContext, type TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { CreateAlbumDto, ReorderPhotosDto } from './albums.dto';
import { AlbumsService } from './albums.service';

@Controller('albums')
@UseGuards(TgInitDataGuard, TenantContextGuard)
export class AlbumsController {
  constructor(private readonly albums: AlbumsService) {}

  @Get()
  list(@Req() request: TgRequest) {
    return this.albums.list(requireTenantContext(request));
  }

  @Get(':id')
  get(@Req() request: TgRequest, @Param('id') id: string) {
    return this.albums.get(requireTenantContext(request), id);
  }

  /** Admin TMA only. */
  @Post()
  @UseGuards(AdminGuard)
  create(@Req() request: TgRequest, @Body() dto: CreateAlbumDto) {
    return this.albums.create(requireTenantContext(request), dto.name);
  }

  @Put(':id/order')
  @UseGuards(AdminGuard)
  reorder(
    @Req() request: TgRequest,
    @Param('id') id: string,
    @Body() dto: ReorderPhotosDto,
  ) {
    return this.albums.reorder(requireTenantContext(request), id, dto.photoIds);
  }
}
