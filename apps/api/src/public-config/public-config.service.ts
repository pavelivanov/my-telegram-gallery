import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenancyMode } from '../config/env';

export interface PublicConfig {
  botUsername: string;
  adminAppShortName: string;
  galleryAppShortName: string;
  privacyUrl: string | null;
  sourceUrl: string;
  tenancyMode: TenancyMode;
  termsUrl: string | null;
  uploadMaxBytes: number;
  version: string;
}

@Injectable()
export class PublicConfigService {
  constructor(private readonly config: ConfigService) {}

  getConfig(): PublicConfig {
    return {
      botUsername: this.config.getOrThrow<string>('TELEGRAM_BOT_USERNAME'),
      adminAppShortName: this.config.getOrThrow<string>(
        'TELEGRAM_ADMIN_APP_SHORT_NAME',
      ),
      galleryAppShortName: this.config.getOrThrow<string>(
        'TELEGRAM_GALLERY_APP_SHORT_NAME',
      ),
      privacyUrl: this.config.get<string>('BILLING_PRIVACY_URL') ?? null,
      sourceUrl: this.config.getOrThrow<string>('APP_SOURCE_URL'),
      tenancyMode: this.config.getOrThrow<TenancyMode>('TENANCY_MODE'),
      termsUrl: this.config.get<string>('BILLING_TERMS_URL') ?? null,
      uploadMaxBytes: this.config.getOrThrow<number>('UPLOAD_MAX_BYTES'),
      version: this.config.getOrThrow<string>('APP_VERSION'),
    };
  }
}
