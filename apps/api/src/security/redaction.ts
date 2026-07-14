import { ConfigService } from '@nestjs/config';

export const ERROR_SECRET_ENV_KEYS = [
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'TENANT_BOT_ENCRYPTION_KEYS',
  'TELEGRAM_WEBHOOK_SECRET',
  'MEDIA_URL_SIGNING_SECRET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'POSTGRES_PASSWORD',
] as const;

const SENSITIVE_FIELD_PATTERN =
  /^(?:authorization|init[_-]?data|bot[_-]?token|tenant_bot_encryption_keys|invoice_payload|telegram_payment_charge_id|provider_payment_charge_id)$/i;

export function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(name);
}

export function redactSensitiveText(
  text: string,
  secretValues: readonly (string | undefined)[],
): string {
  let redacted = text;
  for (const value of secretValues) {
    if (value && value.length >= 4)
      redacted = redacted.replaceAll(value, '[REDACTED]');
  }
  return redacted
    .replace(
      /(["'](?:bot[_-]?token|TENANT_BOT_ENCRYPTION_KEYS)["']\s*:\s*)(?:"[^"]*"|'[^']*')/gi,
      '$1"[REDACTED]"',
    )
    .replace(/(authorization|init[_-]?data)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(
      /(bot[_-]?token|TENANT_BOT_ENCRYPTION_KEYS)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /(invoice_payload|telegram_payment_charge_id|provider_payment_charge_id)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    )
    .replace(/([?&](?:signature|expires)=)[^&\s]+/gi, '$1[REDACTED]');
}

export function redactErrorText(text: string, config: ConfigService): string {
  return redactSensitiveText(
    text,
    ERROR_SECRET_ENV_KEYS.map((key) => {
      const value = config.get<unknown>(key);
      return typeof value === 'string' ? value : undefined;
    }),
  );
}
