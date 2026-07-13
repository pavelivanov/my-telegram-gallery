import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { TgRequest } from '../auth/request-context';

export type RateLimitProfile = 'general' | 'admin' | 'upload' | 'report';

const RATE_LIMIT_PROFILE = 'gallery:rate-limit-profile';

export const UseRateLimit = (profile: RateLimitProfile) =>
  SetMetadata(RATE_LIMIT_PROFILE, profile);

function profileFor(context: ExecutionContext): RateLimitProfile {
  const value: unknown =
    Reflect.getMetadata(RATE_LIMIT_PROFILE, context.getHandler()) ??
    Reflect.getMetadata(RATE_LIMIT_PROFILE, context.getClass());
  return value === 'admin' || value === 'upload' || value === 'report'
    ? value
    : 'general';
}

function trackerFor(requestRaw: unknown): string {
  const request = requestRaw as Partial<TgRequest> & { ip?: unknown };
  const userId = request.tgAuth?.user.id ?? request.tgUser?.id;
  const tenantId = request.tenantContext?.id;
  if (userId && tenantId) return `tg:${userId}:tenant:${tenantId}`;
  if (userId) return `tg:${userId}`;
  return typeof request.ip === 'string' ? `ip:${request.ip}` : 'ip:unknown';
}

export function createRateLimitOptions(
  config: ConfigService,
): ThrottlerModuleOptions {
  const ttl = config.getOrThrow<number>('RATE_LIMIT_TTL_MS');
  const definitions: ReadonlyArray<{
    limitKey:
      | 'RATE_LIMIT_GENERAL'
      | 'RATE_LIMIT_ADMIN'
      | 'RATE_LIMIT_UPLOAD'
      | 'RATE_LIMIT_REPORT';
    name: RateLimitProfile;
  }> = [
    { name: 'general', limitKey: 'RATE_LIMIT_GENERAL' },
    { name: 'admin', limitKey: 'RATE_LIMIT_ADMIN' },
    { name: 'upload', limitKey: 'RATE_LIMIT_UPLOAD' },
    { name: 'report', limitKey: 'RATE_LIMIT_REPORT' },
  ];
  return {
    getTracker: (request) => trackerFor(request),
    throttlers: definitions.map(({ name, limitKey }) => ({
      name,
      ttl,
      limit: config.getOrThrow<number>(limitKey),
      skipIf: (context) => profileFor(context) !== name,
    })),
  };
}
