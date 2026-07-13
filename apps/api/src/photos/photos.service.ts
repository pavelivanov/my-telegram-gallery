import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import sharp from 'sharp';
import {
  Prisma,
  UploadIntentStatus,
  type Photo,
  type UploadIntent,
} from '../../generated/prisma/client';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.types';
import { ALLOWED_UPLOAD_MIME_TYPES, type CreateUploadDto } from './photos.dto';

const THUMB_MAX_DIM = 512;
const THUMB_QUALITY = 75;
const PREVIEW_MAX_DIM = 1280;
const PREVIEW_QUALITY = 80;
const FORMAT_MIME_TYPES: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

interface ValidatedImage {
  buffer: Buffer;
  height: number;
  mimeType: string;
  size: number;
  width: number;
}

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);
  private readonly intentTtlSeconds: number;
  private readonly maxUploadBytes: number;
  private readonly transferMode: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly media: MediaService,
    config: ConfigService,
  ) {
    this.intentTtlSeconds = config.getOrThrow<number>(
      'UPLOAD_INTENT_TTL_SECONDS',
    );
    this.maxUploadBytes = config.getOrThrow<number>('UPLOAD_MAX_BYTES');
    this.transferMode = config.getOrThrow<string>('STORAGE_TRANSFER_MODE');
  }

  async createUpload(dto: CreateUploadDto) {
    if (
      !ALLOWED_UPLOAD_MIME_TYPES.includes(
        dto.contentType as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number],
      )
    ) {
      throw new UnsupportedMediaTypeException('Unsupported image type');
    }
    if (dto.size > this.maxUploadBytes) {
      throw new PayloadTooLargeException('Upload exceeds configured maximum');
    }
    const album = await this.prisma.album.findUnique({
      where: { id: dto.albumId },
      select: { id: true },
    });
    if (!album) throw new NotFoundException('Album not found');

    const uploadId = randomUUID();
    const key = `photos/${album.id}/${uploadId}/original`;
    const expiresAt = new Date(Date.now() + this.intentTtlSeconds * 1000);
    await this.prisma.uploadIntent.create({
      data: {
        id: uploadId,
        key,
        albumId: album.id,
        expectedMimeType: dto.contentType,
        expectedSize: dto.size,
        expiresAt,
      },
    });

    let uploadUrl: string;
    if (this.transferMode === 'direct') {
      if (!this.storage.capabilities.presignPut || !this.storage.presignPut) {
        throw new Error('Configured storage does not support direct uploads');
      }
      uploadUrl = await this.storage.presignPut(
        key,
        { contentLength: dto.size, contentType: dto.contentType },
        this.intentTtlSeconds,
      );
    } else {
      uploadUrl = `/api/photos/uploads/${uploadId}/content`;
    }

    return {
      uploadId,
      uploadUrl,
      uploadMethod: 'PUT' as const,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async expireIntent(intent: UploadIntent): Promise<never> {
    try {
      await this.deleteIntentObjects(intent.key);
      await this.prisma.uploadIntent.updateMany({
        where: {
          id: intent.id,
          status: { not: UploadIntentStatus.CONFIRMED },
        },
        data: { status: UploadIntentStatus.EXPIRED },
      });
    } catch (error) {
      await this.prisma.uploadIntent.updateMany({
        where: {
          id: intent.id,
          status: { not: UploadIntentStatus.CONFIRMED },
        },
        data: { status: UploadIntentStatus.FAILED },
      });
      throw new InternalServerErrorException(
        'Expired upload cleanup must be retried',
        { cause: error },
      );
    }
    throw new GoneException('Upload intent has expired');
  }

  private async loadUsableIntent(uploadId: string): Promise<UploadIntent> {
    const intent = await this.prisma.uploadIntent.findUnique({
      where: { id: uploadId },
    });
    if (!intent) throw new NotFoundException('Upload intent not found');
    if (
      intent.status !== UploadIntentStatus.CONFIRMED &&
      intent.expiresAt.getTime() <= Date.now()
    ) {
      return this.expireIntent(intent);
    }
    return intent;
  }

  async uploadContent(
    uploadId: string,
    body: Readable,
    contentType: string | undefined,
    contentLengthRaw: string | undefined,
  ) {
    if (this.transferMode !== 'proxy') {
      throw new BadRequestException('Proxy uploads are disabled');
    }
    const intent = await this.loadUsableIntent(uploadId);
    if (intent.status !== UploadIntentStatus.PENDING) {
      throw new ConflictException('Upload intent is not pending');
    }
    if (contentType !== intent.expectedMimeType) {
      throw new UnsupportedMediaTypeException('Upload content type changed');
    }
    if (contentLengthRaw) {
      const contentLength = Number(contentLengthRaw);
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength !== intent.expectedSize
      ) {
        throw new BadRequestException('Upload content length changed');
      }
    }

    try {
      await this.storage.put(
        intent.key,
        this.enforceContentLength(body, intent.expectedSize),
        {
          contentLength: intent.expectedSize,
          contentType: intent.expectedMimeType,
        },
      );
    } catch (error) {
      await this.storage.delete(intent.key).catch((cleanupError: unknown) => {
        this.logger.error('Partial upload cleanup failed', cleanupError);
      });
      throw new BadRequestException('Upload failed', { cause: error });
    }

    const updated = await this.prisma.uploadIntent.updateMany({
      where: { id: intent.id, status: UploadIntentStatus.PENDING },
      data: { status: UploadIntentStatus.UPLOADED },
    });
    if (updated.count !== 1) {
      await this.storage.delete(intent.key);
      throw new ConflictException('Upload intent changed during upload');
    }
    return { ok: true };
  }

  private enforceContentLength(body: Readable, expectedSize: number): Readable {
    let received = 0;
    return body.pipe(
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > expectedSize) {
            callback(new Error('Upload exceeds expected content length'));
            return;
          }
          callback(null, chunk);
        },
        flush(callback) {
          callback(
            received === expectedSize
              ? undefined
              : new Error('Upload content length does not match intent'),
          );
        },
      }),
    );
  }

  private variantKeys(key: string) {
    return {
      thumbKey: `${key}.thumb.webp`,
      previewKey: `${key}.preview.webp`,
    };
  }

  private async deleteIntentObjects(key: string): Promise<void> {
    const { thumbKey, previewKey } = this.variantKeys(key);
    await Promise.all([
      this.storage.delete(key),
      this.storage.delete(thumbKey),
      this.storage.delete(previewKey),
    ]);
  }

  private async readObjectBuffer(
    key: string,
    expectedMaximum: number,
  ): Promise<Buffer> {
    const object = await this.storage.get(key);
    if (!object) throw new BadRequestException('Uploaded object is missing');
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of object.body) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      total += buffer.length;
      if (total > expectedMaximum) {
        object.body.destroy();
        throw new PayloadTooLargeException('Uploaded object is too large');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  private async inspectImage(intent: UploadIntent): Promise<ValidatedImage> {
    const stored = await this.storage.stat(intent.key);
    if (!stored) throw new BadRequestException('Uploaded object is missing');
    if (
      stored.contentLength <= 0 ||
      stored.contentLength > this.maxUploadBytes ||
      stored.contentLength !== intent.expectedSize
    ) {
      throw new BadRequestException(
        'Uploaded object size does not match intent',
      );
    }

    const buffer = await this.readObjectBuffer(intent.key, this.maxUploadBytes);
    if (buffer.length !== stored.contentLength) {
      throw new BadRequestException(
        'Uploaded object changed during validation',
      );
    }
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    } catch (error) {
      throw new UnsupportedMediaTypeException(
        'Uploaded file is not a valid image',
        {
          cause: error,
        },
      );
    }
    const mimeType = metadata.format
      ? FORMAT_MIME_TYPES[metadata.format]
      : undefined;
    if (!mimeType || !metadata.width || !metadata.height) {
      throw new UnsupportedMediaTypeException('Unsupported image format');
    }
    if (mimeType !== intent.expectedMimeType) {
      throw new UnsupportedMediaTypeException(
        'Image type does not match intent',
      );
    }
    return {
      buffer,
      height: metadata.height,
      mimeType,
      size: buffer.length,
      width: metadata.width,
    };
  }

  private async generatePreviews(
    key: string,
    original: Buffer,
  ): Promise<{ thumbKey: string; previewKey: string }> {
    const { thumbKey, previewKey } = this.variantKeys(key);
    const thumb = await sharp(original)
      .rotate()
      .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    const preview = await sharp(original)
      .rotate()
      .resize(PREVIEW_MAX_DIM, PREVIEW_MAX_DIM, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();
    await this.storage.put(thumbKey, thumb, {
      contentLength: thumb.length,
      contentType: 'image/webp',
    });
    try {
      await this.storage.put(previewKey, preview, {
        contentLength: preview.length,
        contentType: 'image/webp',
      });
    } catch (error) {
      await this.storage.delete(thumbKey);
      throw error;
    }
    return { thumbKey, previewKey };
  }

  private async rejectIntent(
    intent: UploadIntent,
    error: Error,
  ): Promise<never> {
    await this.prisma.uploadIntent.updateMany({
      where: { id: intent.id, status: { not: UploadIntentStatus.CONFIRMED } },
      data: { status: UploadIntentStatus.FAILED },
    });
    try {
      await this.deleteIntentObjects(intent.key);
    } catch (cleanupError) {
      this.logger.error('Rejected upload cleanup failed', cleanupError);
      throw new InternalServerErrorException(
        'Upload rejected and cleanup must be retried',
        { cause: cleanupError },
      );
    }
    throw error;
  }

  private async createPhotoTransaction(
    intent: UploadIntent,
    image: ValidatedImage,
    variants: { thumbKey: string; previewKey: string },
  ): Promise<Photo> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current = await tx.uploadIntent.findUnique({
              where: { id: intent.id },
              include: { photo: true },
            });
            if (!current)
              throw new NotFoundException('Upload intent not found');
            if (
              current.status === UploadIntentStatus.CONFIRMED &&
              current.photo
            ) {
              return current.photo;
            }
            if (
              current.status !== UploadIntentStatus.PENDING &&
              current.status !== UploadIntentStatus.UPLOADED
            ) {
              throw new ConflictException('Upload intent cannot be confirmed');
            }

            const maximum = await tx.photo.aggregate({
              where: { albumId: current.albumId },
              _max: { position: true },
            });
            const photo = await tx.photo.create({
              data: {
                albumId: current.albumId,
                key: current.key,
                thumbKey: variants.thumbKey,
                previewKey: variants.previewKey,
                mimeType: image.mimeType,
                size: image.size,
                width: image.width,
                height: image.height,
                position: (maximum._max.position ?? 0) + 1,
              },
            });
            await tx.uploadIntent.update({
              where: { id: current.id },
              data: {
                photoId: photo.id,
                status: UploadIntentStatus.CONFIRMED,
              },
            });
            return photo;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: unknown }).code === 'P2034';
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error('Unreachable transaction retry state');
  }

  async confirmUpload(uploadId: string) {
    const intent = await this.loadUsableIntent(uploadId);
    if (intent.status === UploadIntentStatus.CONFIRMED && intent.photoId) {
      const photo = await this.prisma.photo.findUnique({
        where: { id: intent.photoId },
      });
      if (!photo) throw new ConflictException('Confirmed photo is missing');
      return this.media.serializePhoto(photo);
    }
    if (intent.status === UploadIntentStatus.FAILED) {
      throw new ConflictException('Upload intent has failed');
    }

    let image: ValidatedImage;
    try {
      image = await this.inspectImage(intent);
    } catch (error) {
      return this.rejectIntent(
        intent,
        error instanceof Error
          ? error
          : new BadRequestException('Invalid upload'),
      );
    }

    let variants: { thumbKey: string; previewKey: string };
    try {
      variants = await this.generatePreviews(intent.key, image.buffer);
    } catch (error) {
      return this.rejectIntent(
        intent,
        error instanceof Error
          ? error
          : new InternalServerErrorException('Preview generation failed'),
      );
    }

    const photo = await this.createPhotoTransaction(intent, image, variants);
    return this.media.serializePhoto(photo);
  }

  /** Admin: generate previews for photos missing any preview variant. */
  async backfillThumbs() {
    const photos = await this.prisma.photo.findMany({
      where: { OR: [{ thumbKey: null }, { previewKey: null }] },
    });
    let done = 0;
    for (const photo of photos) {
      try {
        const original = await this.readObjectBuffer(
          photo.key,
          this.maxUploadBytes,
        );
        const variants = await this.generatePreviews(photo.key, original);
        await this.prisma.photo.update({
          where: { id: photo.id },
          data: variants,
        });
        done++;
      } catch (error) {
        this.logger.warn(`Preview generation failed for ${photo.id}`, error);
      }
    }
    return { processed: photos.length, generated: done };
  }

  /** Any authenticated Telegram user: list the gallery. */
  async list() {
    const photos = await this.prisma.photo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(photos.map((photo) => this.media.serializePhoto(photo)));
  }

  /** Admin: delete a photo and all variants before deleting its DB record. */
  async remove(id: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException();
    await Promise.all([
      this.storage.delete(photo.key),
      ...(photo.thumbKey ? [this.storage.delete(photo.thumbKey)] : []),
      ...(photo.previewKey ? [this.storage.delete(photo.previewKey)] : []),
    ]);
    await this.prisma.photo.delete({ where: { id } });
  }

  async cleanupExpiredUploads() {
    const stale = await this.prisma.uploadIntent.findMany({
      where: {
        expiresAt: { lte: new Date() },
        status: {
          in: [
            UploadIntentStatus.PENDING,
            UploadIntentStatus.UPLOADED,
            UploadIntentStatus.FAILED,
          ],
        },
      },
    });
    let expired = 0;
    let failed = 0;
    for (const intent of stale) {
      try {
        await this.deleteIntentObjects(intent.key);
        await this.prisma.uploadIntent.update({
          where: { id: intent.id },
          data: { status: UploadIntentStatus.EXPIRED },
        });
        expired++;
      } catch (error) {
        await this.prisma.uploadIntent.update({
          where: { id: intent.id },
          data: { status: UploadIntentStatus.FAILED },
        });
        this.logger.error(`Upload cleanup failed for ${intent.id}`, error);
        failed++;
      }
    }
    return { processed: stale.length, expired, failed };
  }
}
