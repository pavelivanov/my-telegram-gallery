import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { ConfirmUploadDto, CreateUploadDto } from './photos.dto';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(TgInitDataGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  /** Gallery TMA: any authenticated Telegram user. */
  @Get()
  list() {
    return this.photos.list();
  }

  /** Admin TMA only. */
  @Post('upload')
  @UseGuards(AdminGuard)
  createUpload(@Body() dto: CreateUploadDto) {
    return this.photos.createUpload(dto.albumId, dto.contentType);
  }

  @Post('confirm')
  @UseGuards(AdminGuard)
  confirmUpload(@Body() dto: ConfirmUploadDto) {
    return this.photos.confirmUpload(dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.photos.remove(id);
  }
}
