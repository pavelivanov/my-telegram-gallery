import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlbumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
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
  async get(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
      include: {
        photos: { orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!album) throw new NotFoundException();
    return {
      id: album.id,
      name: album.name,
      createdAt: album.createdAt,
      photos: await Promise.all(
        album.photos.map((photo) => this.media.serializePhoto(photo)),
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
