import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';

const THUMB_MAX_DIM = 512;
const THUMB_QUALITY = 75;
const PREVIEW_MAX_DIM = 1280;
const PREVIEW_QUALITY = 80;

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
   * Downscale the original into webp previews stored next to it:
   * a lightweight thumb for grids and a medium-res preview for album covers.
   * Each key is null when the source (or that variant) can't be processed.
   */
  private async generatePreviews(
    key: string,
  ): Promise<{ thumbKey: string | null; previewKey: string | null }> {
    let original: Buffer;
    try {
      original = await this.r2.getObjectBuffer(key);
    } catch (e) {
      this.logger.warn(`Preview generation failed for ${key}: ${e}`);
      return { thumbKey: null, previewKey: null };
    }

    const variant = async (
      maxDim: number,
      quality: number,
      suffix: string,
    ): Promise<string | null> => {
      try {
        const resized = await sharp(original)
          .rotate() // respect EXIF orientation
          .resize(maxDim, maxDim, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality })
          .toBuffer();
        const variantKey = `${key}.${suffix}.webp`;
        await this.r2.putObject(variantKey, resized, 'image/webp');
        return variantKey;
      } catch (e) {
        this.logger.warn(`${suffix} generation failed for ${key}: ${e}`);
        return null;
      }
    };

    return {
      thumbKey: await variant(THUMB_MAX_DIM, THUMB_QUALITY, 'thumb'),
      previewKey: await variant(PREVIEW_MAX_DIM, PREVIEW_QUALITY, 'preview'),
    };
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
    // New photos append to the end of the album (position ascending = display order).
    const max = await this.prisma.photo.aggregate({
      where: { albumId: data.albumId },
      _max: { position: true },
    });
    const { thumbKey, previewKey } = await this.generatePreviews(data.key);
    const photo = await this.prisma.photo.create({
      data: {
        ...data,
        thumbKey,
        previewKey,
        position: (max._max.position ?? 0) + 1,
      },
    });
    return {
      ...photo,
      url: await this.r2.presignDownload(photo.key),
      thumbUrl: photo.thumbKey
        ? await this.r2.presignDownload(photo.thumbKey)
        : null,
    };
  }

  /** Admin: generate previews for photos missing any preview variant. */
  async backfillThumbs() {
    const photos = await this.prisma.photo.findMany({
      where: { OR: [{ thumbKey: null }, { previewKey: null }] },
    });
    let done = 0;
    for (const photo of photos) {
      // Variant keys are deterministic, so regenerating an existing
      // variant just overwrites the same object — no orphans.
      const { thumbKey, previewKey } = await this.generatePreviews(photo.key);
      if (thumbKey || previewKey) {
        await this.prisma.photo.update({
          where: { id: photo.id },
          data: {
            thumbKey: thumbKey ?? photo.thumbKey,
            previewKey: previewKey ?? photo.previewKey,
          },
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
    if (photo.previewKey) await this.r2.delete(photo.previewKey);
    await this.prisma.photo.delete({ where: { id } });
  }
}
