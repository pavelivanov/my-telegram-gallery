import { Injectable, NotFoundException } from '@nestjs/common';
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
        photos: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return Promise.all(
      albums.map(async ({ _count, photos, ...album }) => ({
        ...album,
        photoCount: _count.photos,
        coverUrl: photos[0] ? await this.r2.presignDownload(photos[0].key) : null,
      })),
    );
  }

  /** Album with all photos (presigned GET URLs), newest-first. */
  async get(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
      include: { photos: { orderBy: { createdAt: 'desc' } } },
    });
    if (!album) throw new NotFoundException();
    return {
      ...album,
      photos: await Promise.all(
        album.photos.map(async (p) => ({
          ...p,
          url: await this.r2.presignDownload(p.key),
        })),
      ),
    };
  }
}
