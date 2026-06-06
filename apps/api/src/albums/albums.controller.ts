import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { CreateAlbumDto } from './albums.dto';
import { AlbumsService } from './albums.service';

@Controller('albums')
@UseGuards(TgInitDataGuard)
export class AlbumsController {
  constructor(private readonly albums: AlbumsService) {}

  @Get()
  list() {
    return this.albums.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.albums.get(id);
  }

  /** Admin TMA only. */
  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateAlbumDto) {
    return this.albums.create(dto.name);
  }
}
