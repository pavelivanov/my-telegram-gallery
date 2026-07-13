import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertTenantReadable,
  type TenantContext,
} from '../tenants/tenant-context';

@Injectable()
export class AlbumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async create(context: TenantContext, name: string) {
    assertTenantReadable(context);
    const album = await this.prisma.album.create({
      data: { name, tenantId: context.id },
    });
    return {
      id: album.id,
      name: album.name,
      createdAt: album.createdAt,
      tenantSlug: context.slug,
    };
  }

  /** Albums newest-first, each with photo count and a cover photo URL. */
  async list(context: TenantContext) {
    assertTenantReadable(context);
    const albums = await this.prisma.album.findMany({
      where: { tenantId: context.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { photos: true } },
        photos: { orderBy: { position: 'asc' }, take: 1 },
      },
    });
    return Promise.all(
      albums.map(async ({ _count, photos, ...album }) => {
        const cover = photos[0];
        return {
          id: album.id,
          name: album.name,
          createdAt: album.createdAt,
          tenantSlug: context.slug,
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
    );
  }

  /** Album with all photos, newest-first. */
  async get(context: TenantContext, id: string) {
    assertTenantReadable(context);
    const album = await this.prisma.album.findFirst({
      where: { id, tenantId: context.id },
      include: {
        photos: { orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!album) throw new NotFoundException();
    return {
      id: album.id,
      name: album.name,
      createdAt: album.createdAt,
      tenantSlug: context.slug,
      photos: await Promise.all(
        album.photos.map((photo) => this.media.serializePhoto(photo)),
      ),
    };
  }

  /** Admin: persist a manual photo order — array index becomes position. */
  async reorder(context: TenantContext, id: string, photoIds: string[]) {
    assertTenantReadable(context);
    await this.prisma.$transaction(async (transaction) => {
      const album = await transaction.album.findFirst({
        where: { id, tenantId: context.id },
        select: { id: true },
      });
      if (!album) throw new NotFoundException('Album not found');

      const photos = await transaction.photo.findMany({
        where: { albumId: id, tenantId: context.id },
        select: { id: true },
      });
      const valid = new Set(photos.map((photo) => photo.id));
      if (
        photoIds.length !== valid.size ||
        new Set(photoIds).size !== photoIds.length ||
        photoIds.some((photoId) => !valid.has(photoId))
      ) {
        throw new BadRequestException(
          'photoIds must contain every photo of the album exactly once',
        );
      }

      for (const [index, photoId] of photoIds.entries()) {
        const updated = await transaction.photo.updateMany({
          where: { id: photoId, albumId: id, tenantId: context.id },
          data: { position: index + 1 },
        });
        if (updated.count !== 1) {
          throw new BadRequestException('Photo order changed during update');
        }
      }
    });
    return { ok: true };
  }
}
