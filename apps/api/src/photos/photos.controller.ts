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
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminGuard } from '../auth/admin.guard';
import { requireTenantContext, type TgRequest } from '../auth/request-context';
import { TgInitDataGuard } from '../auth/tg-init-data.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { UseRateLimit } from '../security/rate-limit';
import { ConfirmUploadDto, CreateUploadDto } from './photos.dto';
import { PhotosService } from './photos.service';

@Controller('photos')
@UseGuards(TgInitDataGuard, TenantContextGuard, ThrottlerGuard)
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
  @UseRateLimit('upload')
  createUpload(@Req() request: TgRequest, @Body() dto: CreateUploadDto) {
    return this.photos.createUpload(requireTenantContext(request), dto);
  }

  @Put('uploads/:uploadId/content')
  @UseGuards(AdminGuard)
  @UseRateLimit('upload')
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
  @UseRateLimit('admin')
  confirmUpload(@Req() request: TgRequest, @Body() dto: ConfirmUploadDto) {
    return this.photos.confirmUpload(
      requireTenantContext(request),
      dto.uploadId,
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @UseRateLimit('admin')
  remove(@Req() request: TgRequest, @Param('id') id: string) {
    return this.photos.remove(requireTenantContext(request), id);
  }
}
