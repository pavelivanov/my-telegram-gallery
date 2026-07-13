import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../storage/storage.types';
import { MediaUrlSigner, type MediaVariant } from './media-url.signer';

export interface PhotoForMedia {
  id: string;
  albumId: string;
  key: string;
  thumbKey: string | null;
  previewKey: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  position: number;
  createdAt: Date;
}

export interface PublicPhoto {
  id: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  position: number;
  createdAt: Date;
  url: string;
  thumbUrl: string | null;
}

@Injectable()
export class MediaService {
  private readonly transferMode: string;
  private readonly urlTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly signer: MediaUrlSigner,
    config: ConfigService,
  ) {
    this.transferMode = config.getOrThrow<string>('STORAGE_TRANSFER_MODE');
    this.urlTtlSeconds = config.getOrThrow<number>('MEDIA_URL_TTL_SECONDS');
  }

  private keyForVariant(
    photo: Pick<PhotoForMedia, 'key' | 'previewKey' | 'thumbKey'>,
    variant: MediaVariant,
  ): string | null {
    if (variant === 'original') return photo.key;
    if (variant === 'preview') return photo.previewKey;
    return photo.thumbKey;
  }

  async urlForVariant(
    photo: Pick<PhotoForMedia, 'id' | 'key' | 'previewKey' | 'thumbKey'>,
    variant: MediaVariant,
  ): Promise<string | null> {
    const key = this.keyForVariant(photo, variant);
    if (!key) return null;
    if (this.transferMode === 'direct') {
      if (!this.storage.capabilities.presignGet || !this.storage.presignGet) {
        throw new Error('Configured storage does not support direct downloads');
      }
      return this.storage.presignGet(key, this.urlTtlSeconds);
    }

    const expires = Math.floor(Date.now() / 1000) + this.urlTtlSeconds;
    const signature = this.signer.sign(photo.id, variant, expires);
    return `/api/media/photos/${encodeURIComponent(photo.id)}/${variant}?expires=${expires}&signature=${signature}`;
  }

  async urlForBestVariant(
    photo: Pick<PhotoForMedia, 'id' | 'key' | 'previewKey' | 'thumbKey'>,
    variants: readonly MediaVariant[],
  ): Promise<string> {
    for (const variant of variants) {
      const url = await this.urlForVariant(photo, variant);
      if (url) return url;
    }
    throw new Error('Photo has no available media variant');
  }

  async serializePhoto(photo: PhotoForMedia): Promise<PublicPhoto> {
    return {
      id: photo.id,
      mimeType: photo.mimeType,
      size: photo.size,
      width: photo.width,
      height: photo.height,
      position: photo.position,
      createdAt: photo.createdAt,
      url: await this.urlForBestVariant(photo, ['original']),
      thumbUrl: await this.urlForVariant(photo, 'thumb'),
    };
  }

  async resolveSignedMedia(
    photoId: string,
    variantRaw: string,
    expiresRaw: string | undefined,
    signatureRaw: string | undefined,
  ): Promise<{ expires: number; object: StoredObject }> {
    const signed = this.signer.verify(
      photoId,
      variantRaw,
      expiresRaw,
      signatureRaw,
    );
    if (!signed) throw new ForbiddenException('Invalid or expired media URL');

    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });
    if (!photo) throw new NotFoundException('Photo not found');
    const key = this.keyForVariant(photo, signed.variant);
    if (!key) throw new NotFoundException('Photo variant not found');
    const object = await this.storage.get(key);
    if (!object) throw new NotFoundException('Photo object not found');
    return { expires: signed.expires, object };
  }
}
