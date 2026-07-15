import { isAbsolute, resolve } from 'node:path';

const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 3600;
const DEFAULT_MEDIA_URL_TTL_SECONDS = 3600;
const DEFAULT_READINESS_TIMEOUT_MS = 3000;
const DEFAULT_JSON_BODY_LIMIT_BYTES = 128 * 1024;
const DEFAULT_RATE_LIMIT_TTL_MS = 60_000;
const DEFAULT_TELEGRAM_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;
const DEFAULT_TELEGRAM_BOT_API_TIMEOUT_MS = 5000;
const DEFAULT_BILLING_CHECKOUT_TTL_SECONDS = 900;
const DEFAULT_UPLOAD_INTENT_TTL_SECONDS = 600;
const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const MAX_INIT_DATA_MAX_AGE_SECONDS = 86_400;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const MIN_INIT_DATA_MAX_AGE_SECONDS = 60;
const MIN_MEDIA_SIGNING_SECRET_BYTES = 32;

export type StorageDriver = 'filesystem' | 's3';
export type StorageTransferMode = 'proxy' | 'direct';
export type TenancyMode = 'single' | 'multi';
export type TenantCreationMode = 'open' | 'allowlist' | 'closed';

export interface TenantBotEncryptionKey {
  id: string;
  key: Buffer;
}

export interface AppEnvironment {
  DATABASE_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_ADMIN_APP_SHORT_NAME: string;
  TELEGRAM_GALLERY_APP_SHORT_NAME: string;
  TELEGRAM_BOT_API_TEST_MODE: boolean;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_BODY_LIMIT_BYTES: number;
  TELEGRAM_BOT_API_TIMEOUT_MS: number;
  ADMIN_TG_IDS: string[];
  TENANCY_MODE: TenancyMode;
  TENANT_CREATION_MODE: TenantCreationMode;
  TENANT_CREATION_TG_IDS: string[];
  TENANT_BOT_ENCRYPTION_KEYS: TenantBotEncryptionKey[];
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: number;
  WEB_ORIGINS: string[];
  STORAGE_DRIVER: StorageDriver;
  STORAGE_TRANSFER_MODE: StorageTransferMode;
  FILESYSTEM_STORAGE_PATH?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE: boolean;
  UPLOAD_MAX_BYTES: number;
  UPLOAD_INTENT_TTL_SECONDS: number;
  MEDIA_URL_SIGNING_SECRET: string;
  MEDIA_URL_TTL_SECONDS: number;
  READINESS_TIMEOUT_MS: number;
  JSON_BODY_LIMIT_BYTES: number;
  TRUST_PROXY_HOPS: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_GENERAL: number;
  RATE_LIMIT_ADMIN: number;
  RATE_LIMIT_UPLOAD: number;
  RATE_LIMIT_REPORT: number;
  RATE_LIMIT_WEBHOOK: number;
  BILLING_PRO_PRICE_STARS?: number;
  BILLING_CHECKOUT_TTL_SECONDS: number;
  PAY_SUPPORT_CONTACT?: string;
  BILLING_TERMS_URL?: string;
  BILLING_PRIVACY_URL?: string;
  OPS_TOKEN_SHA256?: string;
  OPS_ACTOR?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_TRACES_SAMPLE_RATE: number;
  STATIC_ROOT?: string;
}

type RawEnvironment = Record<string, unknown>;

function readString(config: RawEnvironment, key: string): string | undefined {
  const value = config[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireString(
  config: RawEnvironment,
  key: string,
  errors: string[],
): string {
  const value = readString(config, key);
  if (!value) errors.push(`${key} is required`);
  return value ?? '';
}

function parseDatabaseUrl(value: string, errors: string[]): string {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      errors.push('DATABASE_URL must use the postgres or postgresql protocol');
    }
  } catch {
    errors.push('DATABASE_URL must be a valid PostgreSQL URL');
  }
  return value;
}

function parseBotUsername(config: RawEnvironment, errors: string[]): string {
  const raw = requireString(config, 'TELEGRAM_BOT_USERNAME', errors);
  const username = raw.replace(/^@/, '');
  if (
    username &&
    (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ||
      !username.toLowerCase().endsWith('bot'))
  ) {
    errors.push(
      'TELEGRAM_BOT_USERNAME must be a 5-32 character Telegram bot username ending in bot',
    );
  }
  return username;
}

function parseAppShortName(
  config: RawEnvironment,
  key: 'TELEGRAM_ADMIN_APP_SHORT_NAME' | 'TELEGRAM_GALLERY_APP_SHORT_NAME',
  errors: string[],
): string {
  const value = requireString(config, key, errors);
  if (value && !/^[A-Za-z0-9_]{3,64}$/.test(value)) {
    errors.push(`${key} must be 3-64 letters, numbers, or underscores`);
  }
  return value;
}

function parseStaticRoot(
  config: RawEnvironment,
  errors: string[],
): string | undefined {
  const value = readString(config, 'STATIC_ROOT');
  if (!value) return undefined;
  if (!isAbsolute(value)) {
    errors.push('STATIC_ROOT must be an absolute path');
    return undefined;
  }
  return resolve(value);
}

function parseAdminIds(
  config: RawEnvironment,
  errors: string[],
  required: boolean,
): string[] {
  const value =
    readString(config, 'ADMIN_TG_IDS') ?? readString(config, 'ADMIN_TG_ID');
  if (!value) {
    if (required) {
      errors.push(
        'ADMIN_TG_IDS is required (legacy ADMIN_TG_ID is also accepted)',
      );
    }
    return [];
  }

  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const normalized: string[] = [];

  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      errors.push(`ADMIN_TG_IDS contains a non-decimal Telegram ID: ${id}`);
      continue;
    }

    const numeric = BigInt(id);
    if (numeric <= 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
      errors.push(`ADMIN_TG_IDS contains an out-of-range Telegram ID: ${id}`);
      continue;
    }
    normalized.push(numeric.toString());
  }

  const unique = [...new Set(normalized)];
  if (required && unique.length === 0) {
    errors.push('ADMIN_TG_IDS must contain at least one Telegram ID');
  }
  return unique;
}

function parseTenancyMode(
  config: RawEnvironment,
  errors: string[],
): TenancyMode {
  const value = readString(config, 'TENANCY_MODE') ?? 'single';
  if (value !== 'single' && value !== 'multi') {
    errors.push('TENANCY_MODE must be single or multi');
    return 'single';
  }
  return value;
}

function parseTenantCreationMode(
  config: RawEnvironment,
  errors: string[],
): TenantCreationMode {
  const value = readString(config, 'TENANT_CREATION_MODE') ?? 'open';
  if (value !== 'open' && value !== 'allowlist' && value !== 'closed') {
    errors.push('TENANT_CREATION_MODE must be open, allowlist, or closed');
    return 'open';
  }
  return value;
}

function parseTenantCreationIds(
  config: RawEnvironment,
  errors: string[],
): string[] {
  const value = readString(config, 'TENANT_CREATION_TG_IDS');
  if (!value) return [];

  const normalized: string[] = [];
  for (const rawId of value.split(',')) {
    const id = rawId.trim();
    if (!id) continue;
    if (!/^\d+$/.test(id)) {
      errors.push(
        `TENANT_CREATION_TG_IDS contains a non-decimal Telegram ID: ${id}`,
      );
      continue;
    }
    const numeric = BigInt(id);
    if (numeric <= 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
      errors.push(
        `TENANT_CREATION_TG_IDS contains an out-of-range Telegram ID: ${id}`,
      );
      continue;
    }
    normalized.push(numeric.toString());
  }
  return [...new Set(normalized)];
}

function parseTenantBotEncryptionKeys(
  config: RawEnvironment,
  errors: string[],
): TenantBotEncryptionKey[] {
  const raw = readString(config, 'TENANT_BOT_ENCRYPTION_KEYS');
  if (!raw) return [];

  const parsed: TenantBotEncryptionKey[] = [];
  const ids = new Set<string>();
  for (const entry of raw.split(',').map((value) => value.trim())) {
    const match = /^([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{43})$/.exec(entry);
    if (!match) {
      errors.push(
        'TENANT_BOT_ENCRYPTION_KEYS must contain comma-separated keyId:base64url-32-byte-key entries',
      );
      continue;
    }
    const [, id, encoded] = match;
    if (ids.has(id)) {
      errors.push(
        `TENANT_BOT_ENCRYPTION_KEYS contains duplicate key ID: ${id}`,
      );
      continue;
    }
    const key = Buffer.from(encoded, 'base64url');
    if (key.length !== 32 || key.toString('base64url') !== encoded) {
      errors.push(
        `TENANT_BOT_ENCRYPTION_KEYS key ${id} must decode to exactly 32 bytes`,
      );
      continue;
    }
    ids.add(id);
    parsed.push({ id, key });
  }
  return parsed;
}

function parseInteger(
  config: RawEnvironment,
  key: string,
  defaultValue: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const raw = readString(config, key) ?? String(defaultValue);
  if (!/^\d+$/.test(raw)) {
    errors.push(`${key} must be an integer`);
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${key} must be between ${min} and ${max}`);
    return defaultValue;
  }
  return value;
}

function parseOptionalInteger(
  config: RawEnvironment,
  key: string,
  min: number,
  max: number,
  errors: string[],
): number | undefined {
  const raw = readString(config, key);
  if (!raw) return undefined;
  if (!/^\d+$/.test(raw)) {
    errors.push(`${key} must be an integer`);
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${key} must be between ${min} and ${max}`);
    return undefined;
  }
  return value;
}

function parseOptionalHttpsUrl(
  config: RawEnvironment,
  key: string,
  errors: string[],
): string | undefined {
  const raw = readString(config, key);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error();
    }
    return url.toString();
  } catch {
    errors.push(`${key} must be an HTTPS URL without embedded credentials`);
    return undefined;
  }
}

function parseSentryDsn(
  config: RawEnvironment,
  errors: string[],
): string | undefined {
  const raw = readString(config, 'SENTRY_DSN');
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      !url.username ||
      url.password ||
      !url.hostname ||
      url.pathname === '/'
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    errors.push(
      'SENTRY_DSN must be an HTTPS Sentry DSN with a public key and project ID',
    );
    return undefined;
  }
}

function parseSentryEnvironment(
  config: RawEnvironment,
  errors: string[],
): string | undefined {
  const value = readString(config, 'SENTRY_ENVIRONMENT');
  if (!value) return undefined;
  if (value.length > 64 || value === 'None' || /[\s/]/.test(value)) {
    errors.push(
      'SENTRY_ENVIRONMENT must be at most 64 characters without whitespace or slashes and cannot be None',
    );
  }
  return value;
}

function parseSentryRelease(
  config: RawEnvironment,
  errors: string[],
): string | undefined {
  const value = readString(config, 'SENTRY_RELEASE');
  if (!value) return undefined;
  if (
    value.length > 200 ||
    value === '.' ||
    value === '..' ||
    /[\r\n\t/\\]/.test(value)
  ) {
    errors.push(
      'SENTRY_RELEASE must be at most 200 characters without control characters or slashes',
    );
  }
  return value;
}

function parseUnitInterval(
  config: RawEnvironment,
  key: string,
  defaultValue: number,
  errors: string[],
): number {
  const raw = readString(config, key) ?? String(defaultValue);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${key} must be between 0 and 1`);
    return defaultValue;
  }
  return value;
}

function parseBoolean(
  config: RawEnvironment,
  key: string,
  defaultValue: boolean,
  errors: string[],
): boolean {
  const raw = readString(config, key);
  if (!raw) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push(`${key} must be true or false`);
  return defaultValue;
}

function parseWebOrigins(config: RawEnvironment, errors: string[]): string[] {
  const raw = readString(config, 'WEB_ORIGINS');
  if (!raw) return [];

  const origins: string[] = [];
  for (const candidate of raw.split(',').map((origin) => origin.trim())) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push(`WEB_ORIGINS must use http or https: ${candidate}`);
        continue;
      }
      if (
        url.origin === 'null' ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        errors.push(
          `WEB_ORIGINS entries must be origins without paths: ${candidate}`,
        );
        continue;
      }
      origins.push(url.origin);
    } catch {
      errors.push(`WEB_ORIGINS contains an invalid origin: ${candidate}`);
    }
  }
  return [...new Set(origins)];
}

function parseStorage(config: RawEnvironment, errors: string[]) {
  const hasLegacyR2 = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ].some((key) => Boolean(readString(config, key)));
  const driverRaw =
    readString(config, 'STORAGE_DRIVER') ?? (hasLegacyR2 ? 's3' : 'filesystem');
  const driver: StorageDriver = driverRaw === 's3' ? 's3' : 'filesystem';
  if (!['filesystem', 's3'].includes(driverRaw)) {
    errors.push('STORAGE_DRIVER must be filesystem or s3');
  }

  const transferRaw =
    readString(config, 'STORAGE_TRANSFER_MODE') ??
    (driver === 's3' ? 'direct' : 'proxy');
  const transferMode: StorageTransferMode =
    transferRaw === 'direct' ? 'direct' : 'proxy';
  if (!['proxy', 'direct'].includes(transferRaw)) {
    errors.push('STORAGE_TRANSFER_MODE must be proxy or direct');
  }
  if (driver === 'filesystem' && transferMode === 'direct') {
    errors.push('filesystem storage only supports STORAGE_TRANSFER_MODE=proxy');
  }

  let filesystemPath: string | undefined;
  let s3Endpoint: string | undefined;
  let s3Region: string | undefined;
  let s3Bucket: string | undefined;
  let s3AccessKeyId: string | undefined;
  let s3SecretAccessKey: string | undefined;

  if (driver === 'filesystem') {
    const rawPath = requireString(config, 'FILESYSTEM_STORAGE_PATH', errors);
    if (rawPath && !isAbsolute(rawPath)) {
      errors.push('FILESYSTEM_STORAGE_PATH must be an absolute path');
    }
    filesystemPath = rawPath ? resolve(rawPath) : undefined;
  } else {
    const r2AccountId = readString(config, 'R2_ACCOUNT_ID');
    s3Endpoint =
      readString(config, 'S3_ENDPOINT') ??
      (r2AccountId
        ? `https://${r2AccountId}.r2.cloudflarestorage.com`
        : undefined);
    if (s3Endpoint) {
      try {
        const url = new URL(s3Endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        s3Endpoint = url.toString().replace(/\/$/, '');
      } catch {
        errors.push('S3_ENDPOINT must be a valid http or https URL');
      }
    }
    s3Region =
      readString(config, 'S3_REGION') ?? (r2AccountId ? 'auto' : undefined);
    s3Bucket =
      readString(config, 'S3_BUCKET') ?? readString(config, 'R2_BUCKET');
    s3AccessKeyId =
      readString(config, 'S3_ACCESS_KEY_ID') ??
      readString(config, 'R2_ACCESS_KEY_ID');
    s3SecretAccessKey =
      readString(config, 'S3_SECRET_ACCESS_KEY') ??
      readString(config, 'R2_SECRET_ACCESS_KEY');

    if (!s3Region) errors.push('S3_REGION is required for s3 storage');
    if (!s3Bucket) errors.push('S3_BUCKET is required for s3 storage');
    if (!s3AccessKeyId) {
      errors.push('S3_ACCESS_KEY_ID is required for s3 storage');
    }
    if (!s3SecretAccessKey) {
      errors.push('S3_SECRET_ACCESS_KEY is required for s3 storage');
    }
  }

  return {
    STORAGE_DRIVER: driver,
    STORAGE_TRANSFER_MODE: transferMode,
    FILESYSTEM_STORAGE_PATH: filesystemPath,
    S3_ENDPOINT: s3Endpoint,
    S3_REGION: s3Region,
    S3_BUCKET: s3Bucket,
    S3_ACCESS_KEY_ID: s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
    S3_FORCE_PATH_STYLE: parseBoolean(
      config,
      'S3_FORCE_PATH_STYLE',
      false,
      errors,
    ),
  };
}

export function validateEnv(
  config: RawEnvironment,
): RawEnvironment & AppEnvironment {
  const errors: string[] = [];
  const databaseUrl = parseDatabaseUrl(
    requireString(config, 'DATABASE_URL', errors),
    errors,
  );
  const botToken = requireString(config, 'TELEGRAM_BOT_TOKEN', errors);
  const botUsername = parseBotUsername(config, errors);
  const adminAppShortName = parseAppShortName(
    config,
    'TELEGRAM_ADMIN_APP_SHORT_NAME',
    errors,
  );
  const galleryAppShortName = parseAppShortName(
    config,
    'TELEGRAM_GALLERY_APP_SHORT_NAME',
    errors,
  );
  const telegramBotApiTestMode = parseBoolean(
    config,
    'TELEGRAM_BOT_API_TEST_MODE',
    true,
    errors,
  );
  const telegramWebhookSecret = readString(config, 'TELEGRAM_WEBHOOK_SECRET');
  if (
    telegramWebhookSecret &&
    (!/^[A-Za-z0-9_-]{32,256}$/.test(telegramWebhookSecret) ||
      Buffer.byteLength(telegramWebhookSecret, 'utf8') > 256)
  ) {
    errors.push(
      'TELEGRAM_WEBHOOK_SECRET must be 32-256 letters, numbers, underscores, or hyphens',
    );
  }
  const telegramWebhookBodyLimit = parseInteger(
    config,
    'TELEGRAM_WEBHOOK_BODY_LIMIT_BYTES',
    DEFAULT_TELEGRAM_WEBHOOK_BODY_LIMIT_BYTES,
    1024,
    DEFAULT_JSON_BODY_LIMIT_BYTES,
    errors,
  );
  const telegramBotApiTimeout = parseInteger(
    config,
    'TELEGRAM_BOT_API_TIMEOUT_MS',
    DEFAULT_TELEGRAM_BOT_API_TIMEOUT_MS,
    500,
    8000,
    errors,
  );
  const tenancyMode = parseTenancyMode(config, errors);
  const tenantCreationMode = parseTenantCreationMode(config, errors);
  const tenantCreationIds = parseTenantCreationIds(config, errors);
  if (tenantCreationMode === 'allowlist' && tenantCreationIds.length === 0) {
    errors.push(
      'TENANT_CREATION_TG_IDS must contain at least one Telegram ID when TENANT_CREATION_MODE=allowlist',
    );
  }
  const tenantBotEncryptionKeys = parseTenantBotEncryptionKeys(config, errors);
  const adminIds = parseAdminIds(config, errors, tenancyMode === 'single');
  const initDataMaxAge = parseInteger(
    config,
    'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS',
    DEFAULT_INIT_DATA_MAX_AGE_SECONDS,
    MIN_INIT_DATA_MAX_AGE_SECONDS,
    MAX_INIT_DATA_MAX_AGE_SECONDS,
    errors,
  );
  const webOrigins = parseWebOrigins(config, errors);
  const storage = parseStorage(config, errors);
  const uploadMaxBytes = parseInteger(
    config,
    'UPLOAD_MAX_BYTES',
    DEFAULT_UPLOAD_MAX_BYTES,
    1,
    MAX_UPLOAD_BYTES,
    errors,
  );
  const uploadIntentTtl = parseInteger(
    config,
    'UPLOAD_INTENT_TTL_SECONDS',
    DEFAULT_UPLOAD_INTENT_TTL_SECONDS,
    60,
    86_400,
    errors,
  );
  const mediaSigningSecret = requireString(
    config,
    'MEDIA_URL_SIGNING_SECRET',
    errors,
  );
  if (
    mediaSigningSecret &&
    Buffer.byteLength(mediaSigningSecret, 'utf8') <
      MIN_MEDIA_SIGNING_SECRET_BYTES
  ) {
    errors.push(
      `MEDIA_URL_SIGNING_SECRET must be at least ${MIN_MEDIA_SIGNING_SECRET_BYTES} bytes`,
    );
  }
  const mediaUrlTtl = parseInteger(
    config,
    'MEDIA_URL_TTL_SECONDS',
    DEFAULT_MEDIA_URL_TTL_SECONDS,
    60,
    86_400,
    errors,
  );
  const staticRoot = parseStaticRoot(config, errors);
  const readinessTimeout = parseInteger(
    config,
    'READINESS_TIMEOUT_MS',
    DEFAULT_READINESS_TIMEOUT_MS,
    100,
    30_000,
    errors,
  );
  const jsonBodyLimit = parseInteger(
    config,
    'JSON_BODY_LIMIT_BYTES',
    DEFAULT_JSON_BODY_LIMIT_BYTES,
    1024,
    1024 * 1024,
    errors,
  );
  const trustProxyHops = parseInteger(
    config,
    'TRUST_PROXY_HOPS',
    0,
    0,
    3,
    errors,
  );
  const rateLimitTtl = parseInteger(
    config,
    'RATE_LIMIT_TTL_MS',
    DEFAULT_RATE_LIMIT_TTL_MS,
    1000,
    3_600_000,
    errors,
  );
  const rateLimitGeneral = parseInteger(
    config,
    'RATE_LIMIT_GENERAL',
    120,
    1,
    10_000,
    errors,
  );
  const rateLimitAdmin = parseInteger(
    config,
    'RATE_LIMIT_ADMIN',
    60,
    1,
    10_000,
    errors,
  );
  const rateLimitUpload = parseInteger(
    config,
    'RATE_LIMIT_UPLOAD',
    20,
    1,
    10_000,
    errors,
  );
  const rateLimitReport = parseInteger(
    config,
    'RATE_LIMIT_REPORT',
    5,
    1,
    10_000,
    errors,
  );
  const rateLimitWebhook = parseInteger(
    config,
    'RATE_LIMIT_WEBHOOK',
    120,
    1,
    10_000,
    errors,
  );
  const billingProPriceStars = parseOptionalInteger(
    config,
    'BILLING_PRO_PRICE_STARS',
    1,
    10_000,
    errors,
  );
  const billingCheckoutTtl = parseInteger(
    config,
    'BILLING_CHECKOUT_TTL_SECONDS',
    DEFAULT_BILLING_CHECKOUT_TTL_SECONDS,
    60,
    3600,
    errors,
  );
  const paySupportContact = readString(config, 'PAY_SUPPORT_CONTACT');
  if (
    paySupportContact &&
    (paySupportContact.length < 3 ||
      paySupportContact.length > 200 ||
      /[\r\n\t]/.test(paySupportContact))
  ) {
    errors.push('PAY_SUPPORT_CONTACT must be 3-200 characters');
  }
  const billingTermsUrl = parseOptionalHttpsUrl(
    config,
    'BILLING_TERMS_URL',
    errors,
  );
  const billingPrivacyUrl = parseOptionalHttpsUrl(
    config,
    'BILLING_PRIVACY_URL',
    errors,
  );
  const opsTokenSha256 = readString(config, 'OPS_TOKEN_SHA256');
  if (opsTokenSha256 && !/^[a-f0-9]{64}$/.test(opsTokenSha256)) {
    errors.push('OPS_TOKEN_SHA256 must be a lowercase SHA-256 hex digest');
  }
  const opsActor = readString(config, 'OPS_ACTOR');
  if (opsActor && !/^[A-Za-z0-9_.@-]{2,64}$/.test(opsActor)) {
    errors.push('OPS_ACTOR must be 2-64 safe identity characters');
  }
  const sentryDsn = parseSentryDsn(config, errors);
  const sentryEnvironment = parseSentryEnvironment(config, errors);
  const sentryRelease = parseSentryRelease(config, errors);
  const sentryTracesSampleRate = parseUnitInterval(
    config,
    'SENTRY_TRACES_SAMPLE_RATE',
    0,
    errors,
  );

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    TELEGRAM_BOT_TOKEN: botToken,
    TELEGRAM_BOT_USERNAME: botUsername,
    TELEGRAM_ADMIN_APP_SHORT_NAME: adminAppShortName,
    TELEGRAM_GALLERY_APP_SHORT_NAME: galleryAppShortName,
    TELEGRAM_BOT_API_TEST_MODE: telegramBotApiTestMode,
    TELEGRAM_WEBHOOK_SECRET: telegramWebhookSecret,
    TELEGRAM_WEBHOOK_BODY_LIMIT_BYTES: telegramWebhookBodyLimit,
    TELEGRAM_BOT_API_TIMEOUT_MS: telegramBotApiTimeout,
    ADMIN_TG_IDS: adminIds,
    TENANCY_MODE: tenancyMode,
    TENANT_CREATION_MODE: tenantCreationMode,
    TENANT_CREATION_TG_IDS: tenantCreationIds,
    TENANT_BOT_ENCRYPTION_KEYS: tenantBotEncryptionKeys,
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: initDataMaxAge,
    WEB_ORIGINS: webOrigins,
    ...storage,
    UPLOAD_MAX_BYTES: uploadMaxBytes,
    UPLOAD_INTENT_TTL_SECONDS: uploadIntentTtl,
    MEDIA_URL_SIGNING_SECRET: mediaSigningSecret,
    MEDIA_URL_TTL_SECONDS: mediaUrlTtl,
    READINESS_TIMEOUT_MS: readinessTimeout,
    JSON_BODY_LIMIT_BYTES: jsonBodyLimit,
    TRUST_PROXY_HOPS: trustProxyHops,
    RATE_LIMIT_TTL_MS: rateLimitTtl,
    RATE_LIMIT_GENERAL: rateLimitGeneral,
    RATE_LIMIT_ADMIN: rateLimitAdmin,
    RATE_LIMIT_UPLOAD: rateLimitUpload,
    RATE_LIMIT_REPORT: rateLimitReport,
    RATE_LIMIT_WEBHOOK: rateLimitWebhook,
    BILLING_PRO_PRICE_STARS: billingProPriceStars,
    BILLING_CHECKOUT_TTL_SECONDS: billingCheckoutTtl,
    PAY_SUPPORT_CONTACT: paySupportContact,
    BILLING_TERMS_URL: billingTermsUrl,
    BILLING_PRIVACY_URL: billingPrivacyUrl,
    OPS_TOKEN_SHA256: opsTokenSha256,
    OPS_ACTOR: opsActor,
    SENTRY_DSN: sentryDsn,
    SENTRY_ENVIRONMENT: sentryEnvironment,
    SENTRY_RELEASE: sentryRelease,
    SENTRY_TRACES_SAMPLE_RATE: sentryTracesSampleRate,
    STATIC_ROOT: staticRoot,
  };
}
