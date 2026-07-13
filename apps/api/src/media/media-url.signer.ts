import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const MEDIA_VARIANTS = ['original', 'preview', 'thumb'] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

function isMediaVariant(value: string): value is MediaVariant {
  return MEDIA_VARIANTS.some((variant) => variant === value);
}

@Injectable()
export class MediaUrlSigner {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('MEDIA_URL_SIGNING_SECRET');
  }

  private signature(
    tenantId: string,
    photoId: string,
    variant: MediaVariant,
    expires: number,
  ): Buffer {
    return createHmac('sha256', this.secret)
      .update(`${tenantId}\n${photoId}\n${variant}\n${expires}`)
      .digest();
  }

  sign(
    tenantId: string,
    photoId: string,
    variant: MediaVariant,
    expires: number,
  ): string {
    return this.signature(tenantId, photoId, variant, expires).toString(
      'base64url',
    );
  }

  verify(
    tenantId: string,
    photoId: string,
    variantRaw: string,
    expiresRaw: string | undefined,
    signatureRaw: string | undefined,
    now = Math.floor(Date.now() / 1000),
  ): { expires: number; variant: MediaVariant } | null {
    if (
      !isMediaVariant(variantRaw) ||
      !expiresRaw ||
      !/^\d+$/.test(expiresRaw) ||
      !signatureRaw ||
      !/^[a-zA-Z0-9_-]{43}$/.test(signatureRaw)
    ) {
      return null;
    }
    const expires = Number(expiresRaw);
    if (!Number.isSafeInteger(expires) || expires <= now) return null;

    const received = Buffer.from(signatureRaw, 'base64url');
    const expected = this.signature(tenantId, photoId, variantRaw, expires);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return null;
    }
    return { expires, variant: variantRaw };
  }
}
