import { validateEnv } from './env';

const SIGNING_SECRET = 'test-media-signing-secret-32-bytes-long';

function validEnvironment(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/gallery',
    TELEGRAM_BOT_TOKEN: '123456:test-only-token',
    TELEGRAM_BOT_USERNAME: '@test_gallery_bot',
    TELEGRAM_ADMIN_APP_SHORT_NAME: 'admin_app',
    TELEGRAM_GALLERY_APP_SHORT_NAME: 'gallery_app',
    ADMIN_TG_IDS: '1, 2,1',
    STORAGE_DRIVER: 'filesystem',
    STORAGE_TRANSFER_MODE: 'proxy',
    FILESYSTEM_STORAGE_PATH: '/tmp/gallery-media',
    MEDIA_URL_SIGNING_SECRET: SIGNING_SECRET,
    WEB_ORIGINS: 'https://admin.example.com, http://localhost:5173',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('normalizes admins, origins, filesystem storage, and defaults', () => {
    const env = validateEnv(validEnvironment());

    expect(env.ADMIN_TG_IDS).toEqual(['1', '2']);
    expect(env.WEB_ORIGINS).toEqual([
      'https://admin.example.com',
      'http://localhost:5173',
    ]);
    expect(env.STORAGE_DRIVER).toBe('filesystem');
    expect(env.STORAGE_TRANSFER_MODE).toBe('proxy');
    expect(env.FILESYSTEM_STORAGE_PATH).toBe('/tmp/gallery-media');
    expect(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS).toBe(3600);
    expect(env.UPLOAD_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(env.UPLOAD_INTENT_TTL_SECONDS).toBe(600);
    expect(env.MEDIA_URL_TTL_SECONDS).toBe(3600);
    expect(env.READINESS_TIMEOUT_MS).toBe(3000);
    expect(env.JSON_BODY_LIMIT_BYTES).toBe(128 * 1024);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
    expect(env.RATE_LIMIT_TTL_MS).toBe(60_000);
    expect(env.RATE_LIMIT_GENERAL).toBe(120);
    expect(env.RATE_LIMIT_ADMIN).toBe(60);
    expect(env.RATE_LIMIT_UPLOAD).toBe(20);
    expect(env.RATE_LIMIT_REPORT).toBe(5);
    expect(env.TELEGRAM_BOT_USERNAME).toBe('test_gallery_bot');
    expect(env.TENANCY_MODE).toBe('single');
  });

  it('supports legacy ADMIN_TG_ID', () => {
    const env = validateEnv(
      validEnvironment({ ADMIN_TG_IDS: '', ADMIN_TG_ID: '42' }),
    );

    expect(env.ADMIN_TG_IDS).toEqual(['42']);
  });

  it('allows database-owned administration without an env allowlist in multi mode', () => {
    const env = validateEnv(
      validEnvironment({ TENANCY_MODE: 'multi', ADMIN_TG_IDS: '' }),
    );

    expect(env.TENANCY_MODE).toBe('multi');
    expect(env.ADMIN_TG_IDS).toEqual([]);
  });

  it('maps legacy R2 variables to the normalized S3 configuration', () => {
    const env = validateEnv(
      validEnvironment({
        STORAGE_DRIVER: '',
        STORAGE_TRANSFER_MODE: '',
        FILESYSTEM_STORAGE_PATH: '',
        R2_ACCOUNT_ID: 'account',
        R2_ACCESS_KEY_ID: 'access',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'gallery',
      }),
    );

    expect(env).toMatchObject({
      STORAGE_DRIVER: 's3',
      STORAGE_TRANSFER_MODE: 'direct',
      S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'gallery',
      S3_ACCESS_KEY_ID: 'access',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
  });

  it('normalizes standard S3 settings', () => {
    const env = validateEnv(
      validEnvironment({
        STORAGE_DRIVER: 's3',
        STORAGE_TRANSFER_MODE: 'proxy',
        FILESYSTEM_STORAGE_PATH: '',
        S3_ENDPOINT: 'https://objects.example.com/',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'gallery',
        S3_ACCESS_KEY_ID: 'access',
        S3_SECRET_ACCESS_KEY: 'secret',
        S3_FORCE_PATH_STYLE: 'true',
      }),
    );

    expect(env).toMatchObject({
      STORAGE_DRIVER: 's3',
      STORAGE_TRANSFER_MODE: 'proxy',
      S3_ENDPOINT: 'https://objects.example.com',
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it('normalizes an empty WEB_ORIGINS value to an empty allowlist', () => {
    const env = validateEnv(validEnvironment({ WEB_ORIGINS: '  ' }));

    expect(env.WEB_ORIGINS).toEqual([]);
  });

  it.each([
    ['missing database', { DATABASE_URL: '' }, 'DATABASE_URL is required'],
    ['wrong database', { DATABASE_URL: 'https://example.com' }, 'postgres'],
    ['missing token', { TELEGRAM_BOT_TOKEN: '' }, 'TELEGRAM_BOT_TOKEN'],
    [
      'invalid bot username',
      { TELEGRAM_BOT_USERNAME: 'gallery' },
      'ending in bot',
    ],
    [
      'invalid app short name',
      { TELEGRAM_GALLERY_APP_SHORT_NAME: 'bad-name' },
      'letters, numbers, or underscores',
    ],
    ['missing admins', { ADMIN_TG_IDS: '', ADMIN_TG_ID: '' }, 'ADMIN_TG_IDS'],
    ['bad tenancy mode', { TENANCY_MODE: 'team' }, 'single or multi'],
    ['bad admin', { ADMIN_TG_IDS: '1,abc' }, 'non-decimal'],
    ['bad max age', { TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '59' }, 'between 60'],
    [
      'bad origin',
      { WEB_ORIGINS: 'https://example.com/path' },
      'without paths',
    ],
    [
      'relative filesystem root',
      { FILESYSTEM_STORAGE_PATH: './media' },
      'absolute path',
    ],
    ['relative static root', { STATIC_ROOT: './dist' }, 'absolute path'],
    [
      'filesystem direct mode',
      { STORAGE_TRANSFER_MODE: 'direct' },
      'only supports',
    ],
    [
      'short signing secret',
      { MEDIA_URL_SIGNING_SECRET: 'too-short' },
      'at least 32 bytes',
    ],
    ['invalid maximum', { UPLOAD_MAX_BYTES: '0' }, 'between 1'],
    [
      'invalid readiness timeout',
      { READINESS_TIMEOUT_MS: '99' },
      'between 100',
    ],
    ['invalid body limit', { JSON_BODY_LIMIT_BYTES: '1000' }, 'between 1024'],
    ['invalid proxy hops', { TRUST_PROXY_HOPS: '4' }, 'between 0'],
    ['invalid rate limit', { RATE_LIMIT_REPORT: '0' }, 'between 1'],
    ['invalid ops hash', { OPS_TOKEN_SHA256: 'not-a-hash' }, 'SHA-256'],
    ['invalid ops actor', { OPS_ACTOR: 'bad actor' }, 'safe identity'],
  ])('rejects %s', (_name, overrides, message) => {
    expect(() => validateEnv(validEnvironment(overrides))).toThrow(message);
  });

  it('reports all missing required settings together', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*ADMIN_TG_IDS[\s\S]*FILESYSTEM_STORAGE_PATH[\s\S]*MEDIA_URL_SIGNING_SECRET/,
    );
  });
});
