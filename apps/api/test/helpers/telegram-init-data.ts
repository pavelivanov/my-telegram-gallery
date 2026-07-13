import { createHmac } from 'node:crypto';

interface TelegramUserFixture {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramInitDataOptions {
  authDate?: number;
  botToken: string;
  omitAuthDate?: boolean;
  omitUser?: boolean;
  startParam?: string;
  user?: TelegramUserFixture;
  userRaw?: string;
}

export function createTelegramInitData({
  authDate = Math.floor(Date.now() / 1000),
  botToken,
  omitAuthDate = false,
  omitUser = false,
  startParam,
  user = { id: 1, first_name: 'Test' },
  userRaw,
}: TelegramInitDataOptions): string {
  const params = new URLSearchParams();
  if (!omitAuthDate) params.set('auth_date', String(authDate));
  if (!omitUser) params.set('user', userRaw ?? JSON.stringify(user));
  if (startParam) params.set('start_param', startParam);

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  params.set('hash', hash);
  return params.toString();
}
