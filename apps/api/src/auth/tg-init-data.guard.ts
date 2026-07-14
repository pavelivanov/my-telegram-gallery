import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TenantBotsService } from '../tenant-bots/tenant-bots.service';
import type { TgRequest } from './request-context';

const FUTURE_CLOCK_SKEW_SECONDS = 30;

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
  constructor(
    private readonly config: ConfigService,
    private readonly tenantBots: TenantBotsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TgRequest>();
    const [type, initDataRaw] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'tma' || !initDataRaw) {
      throw new UnauthorizedException('Missing tma init data');
    }

    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('Missing hash');
    if (!/^[a-f\d]{64}$/i.test(hash)) {
      throw new UnauthorizedException('Invalid init data signature');
    }
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const received = Buffer.from(hash, 'hex');
    const sharedBotToken = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    let botTenantId: string | undefined;
    if (!this.signatureMatches(dataCheckString, received, sharedBotToken)) {
      const tenantCredential = await this.tenantBots.resolveAuthCredential(
        params.get('start_param') ?? undefined,
      );
      if (
        !tenantCredential ||
        !this.signatureMatches(
          dataCheckString,
          received,
          tenantCredential.token,
        )
      ) {
        throw new UnauthorizedException('Invalid init data signature');
      }
      botTenantId = tenantCredential.tenantId;
    }

    const authDateRaw = params.get('auth_date');
    if (!authDateRaw || !/^\d+$/.test(authDateRaw)) {
      throw new UnauthorizedException('Invalid auth date');
    }
    const authDate = Number(authDateRaw);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = this.config.getOrThrow<number>(
      'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS',
    );
    if (authDate > now + FUTURE_CLOCK_SKEW_SECONDS) {
      throw new UnauthorizedException('Init data is from the future');
    }
    if (now - authDate > maxAge) {
      throw new UnauthorizedException('Init data has expired');
    }

    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('Missing user');
    let user: unknown;
    try {
      user = JSON.parse(userRaw);
    } catch {
      throw new UnauthorizedException('Invalid user');
    }
    if (
      typeof user !== 'object' ||
      user === null ||
      !('id' in user) ||
      typeof user.id !== 'number' ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0
    ) {
      throw new UnauthorizedException('Invalid user');
    }

    const tgUser = user as TgUser;
    req.tgAuth = {
      authDate,
      ...(botTenantId ? { botTenantId } : {}),
      startParam: params.get('start_param') ?? undefined,
      user: tgUser,
    };
    req.tgUser = tgUser;
    return true;
  }

  private signatureMatches(
    dataCheckString: string,
    received: Buffer,
    botToken: string,
  ): boolean {
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const computed = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest();
    return (
      received.length === computed.length && timingSafeEqual(computed, received)
    );
  }
}
