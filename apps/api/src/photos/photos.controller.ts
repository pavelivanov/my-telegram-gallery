import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
    return this.photos.createUpload(dto);
  }

  @Put('uploads/:uploadId/content')
  @UseGuards(AdminGuard)
  uploadContent(
    @Param('uploadId') uploadId: string,
    @Req() request: Request,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
  ) {
    return this.photos.uploadContent(
      uploadId,
      request,
      contentType,
      contentLength,
    );
  }

  @Post('confirm')
  @UseGuards(AdminGuard)
  confirmUpload(@Body() dto: ConfirmUploadDto) {
    return this.photos.confirmUpload(dto.uploadId);
  }

  /** One-shot: generate previews for photos that predate thumbnails. */
  @Post('backfill-thumbs')
  @UseGuards(AdminGuard)
  backfillThumbs() {
    return this.photos.backfillThumbs();
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.photos.remove(id);
  }
}
