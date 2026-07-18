import { ConfigService } from '@nestjs/config';
import { PublicConfigService } from './public-config.service';

describe('PublicConfigService', () => {
  it('returns runtime Telegram, tenancy, legal, and upload settings', () => {
    const values = new Map<string, unknown>([
      ['TELEGRAM_BOT_USERNAME', 'gallery_bot'],
      ['TELEGRAM_ADMIN_APP_SHORT_NAME', 'admin'],
      ['TELEGRAM_GALLERY_APP_SHORT_NAME', 'gallery'],
      ['TENANCY_MODE', 'multi'],
      ['UPLOAD_MAX_BYTES', 25_000_000],
      ['BILLING_TERMS_URL', 'https://example.com/terms'],
      ['BILLING_PRIVACY_URL', 'https://example.com/privacy'],
      ['APP_SOURCE_URL', 'https://github.com/example/gallery/tree/abc123'],
      ['APP_VERSION', '0.1.0'],
    ]);
    const config = {
      get: jest.fn((key: string) => values.get(key)),
      getOrThrow: jest.fn((key: string) => {
        const value = values.get(key);
        if (value === undefined) throw new Error(`Missing ${key}`);
        return value;
      }),
    } as unknown as ConfigService;

    expect(new PublicConfigService(config).getConfig()).toEqual({
      botUsername: 'gallery_bot',
      adminAppShortName: 'admin',
      galleryAppShortName: 'gallery',
      privacyUrl: 'https://example.com/privacy',
      sourceUrl: 'https://github.com/example/gallery/tree/abc123',
      tenancyMode: 'multi',
      termsUrl: 'https://example.com/terms',
      uploadMaxBytes: 25_000_000,
      version: '0.1.0',
    });
  });

  it('uses null when optional legal links are not configured', () => {
    const required = new Map<string, unknown>([
      ['TELEGRAM_BOT_USERNAME', 'gallery_bot'],
      ['TELEGRAM_ADMIN_APP_SHORT_NAME', 'admin'],
      ['TELEGRAM_GALLERY_APP_SHORT_NAME', 'gallery'],
      ['TENANCY_MODE', 'single'],
      ['UPLOAD_MAX_BYTES', 1_000],
      ['APP_SOURCE_URL', 'https://github.com/example/gallery/tree/abc123'],
      ['APP_VERSION', '0.1.0'],
    ]);
    const config = {
      get: jest.fn(),
      getOrThrow: jest.fn((key: string) => required.get(key)),
    } as unknown as ConfigService;

    expect(new PublicConfigService(config).getConfig()).toMatchObject({
      privacyUrl: null,
      termsUrl: null,
    });
  });
});
