import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CreateReportDto } from '../reports/reports.dto';
import { UseRateLimit } from '../security/rate-limit';
import { PublicGalleriesService } from './public-galleries.service';

@Controller('public/galleries')
@UseGuards(ThrottlerGuard)
export class PublicGalleriesController {
  constructor(private readonly galleries: PublicGalleriesService) {}

  @Get(':shareId')
  @Header('Cache-Control', 'private, no-store')
  getGallery(@Param('shareId') shareId: string) {
    return this.galleries.getGallery(shareId);
  }

  @Get(':shareId/albums/:albumId')
  @Header('Cache-Control', 'private, no-store')
  getAlbum(
    @Param('shareId') shareId: string,
    @Param('albumId') albumId: string,
  ) {
    return this.galleries.getAlbum(shareId, albumId);
  }

  @Post(':shareId/reports')
  @UseRateLimit('report')
  createReport(
    @Req() request: Request,
    @Param('shareId') shareId: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.galleries.createReport(shareId, request.ip ?? 'unknown', dto);
  }
}
