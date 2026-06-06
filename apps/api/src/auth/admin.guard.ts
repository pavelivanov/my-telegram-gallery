import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { TgUser } from './tg-init-data.guard';

/**
 * Allows only the admin Telegram account (ADMIN_TG_ID).
 * Must run after TgInitDataGuard, which sets req.tgUser.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const tgUser = req['tgUser'] as TgUser | undefined;
    const adminId = this.config.getOrThrow<string>('ADMIN_TG_ID');
    if (!tgUser || String(tgUser.id) !== adminId) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
