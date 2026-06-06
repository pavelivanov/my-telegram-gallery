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
import type { Request } from 'express';
import { TgInitDataGuard, TgUser } from '../auth/tg-init-data.guard';
import { ConfirmUploadDto, CreateUploadDto } from './photos.dto';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(TgInitDataGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  private user(req: Request): TgUser {
    return req['tgUser'] as TgUser;
  }

  @Post('upload')
  createUpload(@Req() req: Request, @Body() dto: CreateUploadDto) {
    return this.photos.createUpload(this.user(req), dto.contentType);
  }

  @Post('confirm')
  confirmUpload(@Req() req: Request, @Body() dto: ConfirmUploadDto) {
    return this.photos.confirmUpload(this.user(req), dto);
  }

  @Get()
  list(@Req() req: Request) {
    return this.photos.list(this.user(req));
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.photos.remove(this.user(req), id);
  }
}
