import { isAbsolute, resolve } from 'node:path';

const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 3600;
const DEFAULT_MEDIA_URL_TTL_SECONDS = 3600;
const DEFAULT_READINESS_TIMEOUT_MS = 3000;
const DEFAULT_UPLOAD_INTENT_TTL_SECONDS = 600;
const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const MAX_INIT_DATA_MAX_AGE_SECONDS = 86_400;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const MIN_INIT_DATA_MAX_AGE_SECONDS = 60;
const MIN_MEDIA_SIGNING_SECRET_BYTES = 32;

export type StorageDriver = 'filesystem' | 's3';
export type StorageTransferMode = 'proxy' | 'direct';
export type TenancyMode = 'single' | 'multi';

export interface AppEnvironment {
  DATABASE_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_ADMIN_APP_SHORT_NAME: string;
  TELEGRAM_GALLERY_APP_SHORT_NAME: string;
  ADMIN_TG_IDS: string[];
  TENANCY_MODE: TenancyMode;
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
  const tenancyMode = parseTenancyMode(config, errors);
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
    ADMIN_TG_IDS: adminIds,
    TENANCY_MODE: tenancyMode,
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: initDataMaxAge,
    WEB_ORIGINS: webOrigins,
    ...storage,
    UPLOAD_MAX_BYTES: uploadMaxBytes,
    UPLOAD_INTENT_TTL_SECONDS: uploadIntentTtl,
    MEDIA_URL_SIGNING_SECRET: mediaSigningSecret,
    MEDIA_URL_TTL_SECONDS: mediaUrlTtl,
    READINESS_TIMEOUT_MS: readinessTimeout,
    STATIC_ROOT: staticRoot,
  };
}
