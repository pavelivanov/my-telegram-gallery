import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { createRateLimitOptions } from './rate-limit';

function asOptions(options: ThrottlerModuleOptions) {
  if (Array.isArray(options)) throw new Error('Expected named throttlers');
  return options;
}

describe('rate limit configuration', () => {
  const options = asOptions(
    createRateLimitOptions(
      new ConfigService({
        RATE_LIMIT_TTL_MS: 60_000,
        RATE_LIMIT_GENERAL: 120,
        RATE_LIMIT_ADMIN: 60,
        RATE_LIMIT_UPLOAD: 20,
        RATE_LIMIT_REPORT: 5,
      }),
    ),
  );

  it('selects exactly one named profile per handler', () => {
    const handler = () => undefined;
    Reflect.defineMetadata('gallery:rate-limit-profile', 'upload', handler);
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
    } as ExecutionContext;

    expect(
      options.throttlers
        .find(({ name }) => name === 'upload')
        ?.skipIf?.(context),
    ).toBe(false);
    expect(
      options.throttlers
        .find(({ name }) => name === 'general')
        ?.skipIf?.(context),
    ).toBe(true);
  });

  it('tracks validated users inside a tenant separately', async () => {
    await expect(
      Promise.resolve(
        options.getTracker?.(
          {
            ip: '127.0.0.1',
            tgAuth: { user: { id: 42 } },
            tenantContext: { id: 'tenant-one' },
          },
          {} as ExecutionContext,
        ),
      ),
    ).resolves.toBe('tg:42:tenant:tenant-one');
    await expect(
      Promise.resolve(
        options.getTracker?.({ ip: '127.0.0.1' }, {} as ExecutionContext),
      ),
    ).resolves.toBe('ip:127.0.0.1');
  });
});
