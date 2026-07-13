import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenancyMode } from '../config/env';

export interface PublicConfig {
  botUsername: string;
  adminAppShortName: string;
  galleryAppShortName: string;
  tenancyMode: TenancyMode;
  uploadMaxBytes: number;
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
      tenancyMode: this.config.getOrThrow<TenancyMode>('TENANCY_MODE'),
      uploadMaxBytes: this.config.getOrThrow<number>('UPLOAD_MAX_BYTES'),
    };
  }
}
