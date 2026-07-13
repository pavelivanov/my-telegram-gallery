import { validateEnv } from './env';

function validEnvironment(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/gallery',
    TELEGRAM_BOT_TOKEN: '123456:test-only-token',
    ADMIN_TG_IDS: '1, 2,1',
    R2_ACCOUNT_ID: 'account',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'gallery',
    WEB_ORIGINS: 'https://admin.example.com, http://localhost:5173',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('normalizes admins, origins, and defaults', () => {
    const env = validateEnv(validEnvironment());

    expect(env.ADMIN_TG_IDS).toEqual(['1', '2']);
    expect(env.WEB_ORIGINS).toEqual([
      'https://admin.example.com',
      'http://localhost:5173',
    ]);
    expect(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS).toBe(3600);
  });

  it('supports legacy ADMIN_TG_ID', () => {
    const env = validateEnv(
      validEnvironment({ ADMIN_TG_IDS: '', ADMIN_TG_ID: '42' }),
    );

    expect(env.ADMIN_TG_IDS).toEqual(['42']);
  });

  it('normalizes an empty WEB_ORIGINS value to an empty allowlist', () => {
    const env = validateEnv(validEnvironment({ WEB_ORIGINS: '  ' }));

    expect(env.WEB_ORIGINS).toEqual([]);
  });

  it.each([
    ['missing database', { DATABASE_URL: '' }, 'DATABASE_URL is required'],
    ['wrong database', { DATABASE_URL: 'https://example.com' }, 'postgres'],
    ['missing token', { TELEGRAM_BOT_TOKEN: '' }, 'TELEGRAM_BOT_TOKEN'],
    ['missing admins', { ADMIN_TG_IDS: '', ADMIN_TG_ID: '' }, 'ADMIN_TG_IDS'],
    ['bad admin', { ADMIN_TG_IDS: '1,abc' }, 'non-decimal'],
    ['bad max age', { TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '59' }, 'between 60'],
    [
      'bad origin',
      { WEB_ORIGINS: 'https://example.com/path' },
      'without paths',
    ],
    ['incomplete R2', { R2_BUCKET: '' }, 'R2_BUCKET'],
  ])('rejects %s', (_name, overrides, message) => {
    expect(() => validateEnv(validEnvironment(overrides))).toThrow(message);
  });

  it('reports all missing required settings together', () => {
    expect(() => validateEnv({})).toThrow(
      /DATABASE_URL[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*ADMIN_TG_IDS[\s\S]*R2_ACCOUNT_ID/,
    );
  });
});
