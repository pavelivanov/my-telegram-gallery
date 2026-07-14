import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { TenancyMode } from '../config/env';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReportDto } from '../reports/reports.dto';
import { ReportsService } from '../reports/reports.service';
import type { TenantContext } from '../tenants/tenant-context';

const PUBLIC_SHARE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

@Injectable()
export class PublicGalleriesService {
  private readonly mode: TenancyMode;
  private readonly reportHashKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly reports: ReportsService,
    config: ConfigService,
  ) {
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
    this.reportHashKey = config.getOrThrow<string>('MEDIA_URL_SIGNING_SECRET');
  }

  async getGallery(shareId: string) {
    const context = await this.resolve(shareId);
    const albums = await this.prisma.album.findMany({
      where: { tenantId: context.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { photos: true } },
        photos: { orderBy: { position: 'asc' }, take: 1 },
      },
    });
    return {
      gallery: this.serializeGallery(context),
      albums: await Promise.all(
        albums.map(async ({ _count, photos, ...album }) => {
          const cover = photos[0];
          return {
            id: album.id,
            name: album.name,
            createdAt: album.createdAt,
            photoCount: _count.photos,
            coverUrl: cover
              ? await this.media.urlForBestVariant(cover, [
                  'preview',
                  'thumb',
                  'original',
                ])
              : null,
            coverThumbUrl: cover
              ? await this.media.urlForBestVariant(cover, ['thumb', 'original'])
              : null,
          };
        }),
      ),
    };
  }

  async getAlbum(shareId: string, albumId: string) {
    const context = await this.resolve(shareId);
    const album = await this.prisma.album.findFirst({
      where: { id: albumId, tenantId: context.id },
      include: {
        photos: { orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!album) throw new NotFoundException('Gallery not found');
    return {
      gallery: this.serializeGallery(context),
      album: {
        id: album.id,
        name: album.name,
        createdAt: album.createdAt,
        photos: await Promise.all(
          album.photos.map((photo) => this.media.serializePhoto(photo)),
        ),
      },
    };
  }

  async createReport(
    shareId: string,
    reporterIp: string,
    dto: CreateReportDto,
  ) {
    const context = await this.resolve(shareId);
    const reporterFingerprint = createHmac('sha256', this.reportHashKey)
      .update(`public-web-report:v1\0${reporterIp.trim().toLowerCase()}`)
      .digest('hex');
    return this.reports.createAnonymous(context, reporterFingerprint, dto);
  }

  private async resolve(shareId: string): Promise<TenantContext> {
    if (!PUBLIC_SHARE_PATTERN.test(shareId)) {
      throw new NotFoundException('Gallery not found');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { publicShareId: shareId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        theme: true,
        botCredential: {
          select: {
            username: true,
            adminAppShortName: true,
            galleryAppShortName: true,
            verifiedAt: true,
          },
        },
      },
    });
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException('Gallery not found');
    }
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      theme: tenant.theme,
      mode: this.mode,
      bot: tenant.botCredential,
    };
  }

  private serializeGallery(context: TenantContext) {
    return {
      name: context.name,
      telegramSlug: context.slug,
      theme: context.theme.toLowerCase(),
      bot: context.bot,
    };
  }
}
