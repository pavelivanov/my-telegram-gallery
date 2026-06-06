import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  /** Step 1 (admin): get a presigned upload URL. */
  async createUpload(albumId: string, contentType: string) {
    const album = await this.prisma.album.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('Album not found');
    const key = `photos/${albumId}/${randomUUID()}`;
    const uploadUrl = await this.r2.presignUpload(key, contentType);
    return { key, uploadUrl };
  }

  /** Step 2 (admin): confirm upload finished — persist the record. */
  async confirmUpload(data: {
    albumId: string;
    key: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
  }) {
    const photo = await this.prisma.photo.create({ data });
    return { ...photo, url: await this.r2.presignDownload(photo.key) };
  }

  /** Any authenticated Telegram user: list the gallery. */
  async list() {
    const photos = await this.prisma.photo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await this.r2.presignDownload(p.key),
      })),
    );
  }

  /** Admin: delete a photo from R2 and the database. */
  async remove(id: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException();
    await this.r2.delete(photo.key);
    await this.prisma.photo.delete({ where: { id } });
  }
}
