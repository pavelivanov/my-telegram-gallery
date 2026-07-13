import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  private readonly expected?: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    this.expected = secret ? digest(secret) : undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const candidate = request.headers['x-telegram-bot-api-secret-token'];
    const value = Array.isArray(candidate) ? '' : (candidate ?? '');
    const supplied = digest(value);
    if (!this.expected || !timingSafeEqual(supplied, this.expected)) {
      throw new UnauthorizedException('Invalid Telegram webhook');
    }
    return true;
  }
}
