import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';

const THUMB_MAX_DIM = 512;
const THUMB_QUALITY = 75;

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

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

  /**
   * Downscale the original into a lightweight webp preview stored next to it.
   * Returns the thumb key, or null when the source can't be processed.
   */
  private async generateThumb(key: string): Promise<string | null> {
    try {
      const original = await this.r2.getObjectBuffer(key);
      const thumb = await sharp(original)
        .rotate() // respect EXIF orientation
        .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer();
      const thumbKey = `${key}.thumb.webp`;
      await this.r2.putObject(thumbKey, thumb, 'image/webp');
      return thumbKey;
    } catch (e) {
      this.logger.warn(`Thumbnail generation failed for ${key}: ${e}`);
      return null;
    }
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
    // New photos go to the front of the album (position ascending = display order).
    const min = await this.prisma.photo.aggregate({
      where: { albumId: data.albumId },
      _min: { position: true },
    });
    const thumbKey = await this.generateThumb(data.key);
    const photo = await this.prisma.photo.create({
      data: { ...data, thumbKey, position: (min._min.position ?? 1) - 1 },
    });
    return {
      ...photo,
      url: await this.r2.presignDownload(photo.key),
      thumbUrl: photo.thumbKey
        ? await this.r2.presignDownload(photo.thumbKey)
        : null,
    };
  }

  /** Admin: generate previews for photos uploaded before thumbnails existed. */
  async backfillThumbs() {
    const photos = await this.prisma.photo.findMany({
      where: { thumbKey: null },
    });
    let done = 0;
    for (const photo of photos) {
      const thumbKey = await this.generateThumb(photo.key);
      if (thumbKey) {
        await this.prisma.photo.update({
          where: { id: photo.id },
          data: { thumbKey },
        });
        done++;
      }
    }
    return { processed: photos.length, generated: done };
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
        thumbUrl: p.thumbKey ? await this.r2.presignDownload(p.thumbKey) : null,
      })),
    );
  }

  /** Admin: delete a photo (original + preview) from R2 and the database. */
  async remove(id: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException();
    await this.r2.delete(photo.key);
    if (photo.thumbKey) await this.r2.delete(photo.thumbKey);
    await this.prisma.photo.delete({ where: { id } });
  }
}
