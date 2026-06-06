import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

/**
 * Validates Telegram Mini App init data passed in the
 * `Authorization: tma <initDataRaw>` header.
 * https://docs.telegram-mini-apps.com/platform/init-data
 */
@Injectable()
export class TgInitDataGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const [type, initDataRaw] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'tma' || !initDataRaw) {
      throw new UnauthorizedException('Missing tma init data');
    }

    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('Missing hash');
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const botToken = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const computed = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computed !== hash) {
      throw new UnauthorizedException('Invalid init data signature');
    }

    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('Missing user');
    req['tgUser'] = JSON.parse(userRaw) as TgUser;
    return true;
  }
}
