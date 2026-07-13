const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 3600;
const MAX_INIT_DATA_MAX_AGE_SECONDS = 86_400;
const MIN_INIT_DATA_MAX_AGE_SECONDS = 60;

export interface AppEnvironment {
  DATABASE_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  ADMIN_TG_IDS: string[];
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: number;
  WEB_ORIGINS: string[];
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
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

function parseAdminIds(config: RawEnvironment, errors: string[]): string[] {
  const value =
    readString(config, 'ADMIN_TG_IDS') ?? readString(config, 'ADMIN_TG_ID');
  if (!value) {
    errors.push(
      'ADMIN_TG_IDS is required (legacy ADMIN_TG_ID is also accepted)',
    );
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
  if (unique.length === 0 && errors.length === 0) {
    errors.push('ADMIN_TG_IDS must contain at least one Telegram ID');
  }
  return unique;
}

function parseMaxAge(config: RawEnvironment, errors: string[]): number {
  const raw =
    readString(config, 'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS') ??
    String(DEFAULT_INIT_DATA_MAX_AGE_SECONDS);

  if (!/^\d+$/.test(raw)) {
    errors.push('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be an integer');
    return DEFAULT_INIT_DATA_MAX_AGE_SECONDS;
  }

  const value = Number(raw);
  if (
    value < MIN_INIT_DATA_MAX_AGE_SECONDS ||
    value > MAX_INIT_DATA_MAX_AGE_SECONDS
  ) {
    errors.push(
      `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be between ${MIN_INIT_DATA_MAX_AGE_SECONDS} and ${MAX_INIT_DATA_MAX_AGE_SECONDS}`,
    );
  }
  return value;
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

export function validateEnv(
  config: RawEnvironment,
): RawEnvironment & AppEnvironment {
  const errors: string[] = [];
  const databaseUrl = parseDatabaseUrl(
    requireString(config, 'DATABASE_URL', errors),
    errors,
  );
  const botToken = requireString(config, 'TELEGRAM_BOT_TOKEN', errors);
  const adminIds = parseAdminIds(config, errors);
  const maxAge = parseMaxAge(config, errors);
  const webOrigins = parseWebOrigins(config, errors);
  const r2AccountId = requireString(config, 'R2_ACCOUNT_ID', errors);
  const r2AccessKeyId = requireString(config, 'R2_ACCESS_KEY_ID', errors);
  const r2SecretAccessKey = requireString(
    config,
    'R2_SECRET_ACCESS_KEY',
    errors,
  );
  const r2Bucket = requireString(config, 'R2_BUCKET', errors);

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    TELEGRAM_BOT_TOKEN: botToken,
    ADMIN_TG_IDS: adminIds,
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: maxAge,
    WEB_ORIGINS: webOrigins,
    R2_ACCOUNT_ID: r2AccountId,
    R2_ACCESS_KEY_ID: r2AccessKeyId,
    R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
    R2_BUCKET: r2Bucket,
  };
}
