import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TgRequest } from './request-context';

/**
 * Allows only configured single-gallery administrators (ADMIN_TG_IDS).
 * Must run after TgInitDataGuard, which sets req.tgAuth and req.tgUser.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<TgRequest>();
    const tgUser = req.tgAuth?.user ?? req.tgUser;
    const adminIds = this.config.getOrThrow<readonly string[]>('ADMIN_TG_IDS');
    if (!tgUser || !adminIds.includes(String(tgUser.id))) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
