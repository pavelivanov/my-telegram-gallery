import { ConfigService } from '@nestjs/config';

const SECRET_KEYS = [
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'MEDIA_URL_SIGNING_SECRET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export function redactErrorText(text: string, config: ConfigService): string {
  let redacted = text;
  for (const key of SECRET_KEYS) {
    const value = config.get<string>(key);
    if (value && value.length >= 4)
      redacted = redacted.replaceAll(value, '[REDACTED]');
  }
  return redacted
    .replace(/(authorization|init[_-]?data)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/([?&](?:signature|expires)=)[^&\s]+/gi, '$1[REDACTED]');
}
