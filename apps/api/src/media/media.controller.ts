import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('photos/:photoId/:variant')
  async getPhoto(
    @Param('photoId') photoId: string,
    @Param('variant') variant: string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const media = await this.media.resolveSignedMedia(
      photoId,
      variant,
      expires,
      signature,
    );
    const remaining = Math.max(
      0,
      media.expires - Math.floor(Date.now() / 1000),
    );
    response.setHeader('Content-Type', media.object.contentType);
    response.setHeader('Content-Length', String(media.object.contentLength));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', `public, max-age=${remaining}`);
    return new StreamableFile(media.object.body);
  }
}
