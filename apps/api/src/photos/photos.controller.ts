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
import { AdminGuard } from '../auth/admin.guard';
import { requireTenantContext, type TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { ConfirmUploadDto, CreateUploadDto } from './photos.dto';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(TgInitDataGuard, TenantContextGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  /** Gallery TMA: any authenticated Telegram user. */
  @Get()
  list(@Req() request: TgRequest) {
    return this.photos.list(requireTenantContext(request));
  }

  /** Admin TMA only. */
  @Post('upload')
  @UseGuards(AdminGuard)
  createUpload(@Req() request: TgRequest, @Body() dto: CreateUploadDto) {
    return this.photos.createUpload(requireTenantContext(request), dto);
  }

  @Put('uploads/:uploadId/content')
  @UseGuards(AdminGuard)
  uploadContent(
    @Param('uploadId') uploadId: string,
    @Req() request: TgRequest,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
  ) {
    return this.photos.uploadContent(
      requireTenantContext(request),
      uploadId,
      request,
      contentType,
      contentLength,
    );
  }

  @Post('confirm')
  @UseGuards(AdminGuard)
  confirmUpload(@Req() request: TgRequest, @Body() dto: ConfirmUploadDto) {
    return this.photos.confirmUpload(
      requireTenantContext(request),
      dto.uploadId,
    );
  }

  /** One-shot: generate previews for photos that predate thumbnails. */
  @Post('backfill-thumbs')
  @UseGuards(AdminGuard)
  backfillThumbs(@Req() request: TgRequest) {
    return this.photos.backfillThumbs(requireTenantContext(request));
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Req() request: TgRequest, @Param('id') id: string) {
    return this.photos.remove(requireTenantContext(request), id);
  }
}
