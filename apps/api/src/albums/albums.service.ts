import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';

@Injectable()
export class AlbumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  create(name: string) {
    return this.prisma.album.create({ data: { name } });
  }

  /** Albums newest-first, each with photo count and a cover photo URL. */
  async list() {
    const albums = await this.prisma.album.findMany({
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
          ...album,
          photoCount: _count.photos,
          // Medium-res preview: covers render near full-width in the gallery.
          coverUrl: cover
            ? await this.r2.presignDownload(
                cover.previewKey ?? cover.thumbKey ?? cover.key,
              )
            : null,
          // Lightweight variant for small cover avatars (admin list).
          coverThumbUrl: cover
            ? await this.r2.presignDownload(cover.thumbKey ?? cover.key)
            : null,
        };
      }),
    );
  }

  /** Album with all photos (presigned GET URLs), newest-first. */
  async get(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
      include: {
        photos: { orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!album) throw new NotFoundException();
    return {
      ...album,
      photos: await Promise.all(
        album.photos.map(async (p) => ({
          ...p,
          url: await this.r2.presignDownload(p.key),
          thumbUrl: p.thumbKey
            ? await this.r2.presignDownload(p.thumbKey)
            : null,
        })),
      ),
    };
  }

  /** Admin: persist a manual photo order — array index becomes position. */
  async reorder(id: string, photoIds: string[]) {
    const photos = await this.prisma.photo.findMany({
      where: { albumId: id },
      select: { id: true },
    });
    const valid = new Set(photos.map((p) => p.id));
    if (
      photoIds.length !== valid.size ||
      photoIds.some((pid) => !valid.has(pid))
    ) {
      throw new BadRequestException(
        'photoIds must contain every photo of the album exactly once',
      );
    }
    await this.prisma.$transaction(
      photoIds.map((pid, index) =>
        this.prisma.photo.update({
          where: { id: pid },
          data: { position: index + 1 },
        }),
      ),
    );
    return { ok: true };
  }
}
