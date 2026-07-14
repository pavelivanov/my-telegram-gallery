import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTelegramInitData } from '../../test/helpers/telegram-init-data';
import type { TgRequest } from './request-context';
import { TgInitDataGuard } from './tg-init-data.guard';
import type { TenantBotsService } from '../tenant-bots/tenant-bots.service';

const BOT_TOKEN = '123456:test-only-token';
const TENANT_BOT_TOKEN = '700000001:tenant_bot_secret_token_1234567890';

function executionContext(request: Partial<TgRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

function requestFor(initData?: string): Partial<TgRequest> {
  return {
    headers: initData ? { authorization: `tma ${initData}` } : {},
  } as Partial<TgRequest>;
}

describe('TgInitDataGuard', () => {
  const config = new ConfigService({
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: 3600,
  });
  const tenantBots = {
    resolveAuthCredential: jest.fn(),
  };
  const guard = new TgInitDataGuard(
    config,
    tenantBots as unknown as TenantBotsService,
  );

  beforeEach(() => {
    tenantBots.resolveAuthCredential.mockReset().mockResolvedValue(null);
  });

  it('accepts fresh signed data and attaches typed auth context', async () => {
    const request = requestFor(
      createTelegramInitData({
        botToken: BOT_TOKEN,
        startParam: 'album_123',
        user: { id: 42, first_name: 'Admin' },
      }),
    );

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
    expect(request.tgAuth).toMatchObject({
      startParam: 'album_123',
      user: { id: 42, first_name: 'Admin' },
    });
    expect(request.tgUser).toEqual(request.tgAuth?.user);
    expect(tenantBots.resolveAuthCredential).not.toHaveBeenCalled();
  });

  it('accepts a tenant bot signature only for its selected tenant', async () => {
    tenantBots.resolveAuthCredential.mockResolvedValueOnce({
      tenantId: 'tenant-alpha',
      token: TENANT_BOT_TOKEN,
    });
    const request = requestFor(
      createTelegramInitData({
        botToken: TENANT_BOT_TOKEN,
        startParam: 'tenant_alpha_gallery',
        user: { id: 42 },
      }),
    );

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
    expect(request.tgAuth).toMatchObject({
      botTenantId: 'tenant-alpha',
      startParam: 'tenant_alpha_gallery',
    });
  });

  it('rejects a missing authorization header', async () => {
    await expect(
      guard.canActivate(executionContext(requestFor())),
    ).rejects.toEqual(new UnauthorizedException('Missing tma init data'));
  });

  it('rejects a bad signature', async () => {
    const params = new URLSearchParams(
      createTelegramInitData({ botToken: BOT_TOKEN }),
    );
    params.set('hash', '0'.repeat(64));

    await expect(
      guard.canActivate(executionContext(requestFor(params.toString()))),
    ).rejects.toThrow('Invalid init data signature');
  });

  it('rejects a malformed signature before comparing it', async () => {
    const params = new URLSearchParams(
      createTelegramInitData({ botToken: BOT_TOKEN }),
    );
    params.set('hash', 'not-hex');

    await expect(
      guard.canActivate(executionContext(requestFor(params.toString()))),
    ).rejects.toThrow('Invalid init data signature');
  });

  it('rejects stale init data', async () => {
    const initData = createTelegramInitData({
      authDate: Math.floor(Date.now() / 1000) - 3601,
      botToken: BOT_TOKEN,
    });

    await expect(
      guard.canActivate(executionContext(requestFor(initData))),
    ).rejects.toThrow('Init data has expired');
  });

  it('rejects init data too far in the future', async () => {
    const initData = createTelegramInitData({
      authDate: Math.floor(Date.now() / 1000) + 31,
      botToken: BOT_TOKEN,
    });

    await expect(
      guard.canActivate(executionContext(requestFor(initData))),
    ).rejects.toThrow('Init data is from the future');
  });

  it('rejects a missing auth date', async () => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      omitAuthDate: true,
    });

    await expect(
      guard.canActivate(executionContext(requestFor(initData))),
    ).rejects.toThrow('Invalid auth date');
  });

  it('rejects malformed user JSON as unauthorized', async () => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      userRaw: '{bad-json',
    });

    await expect(
      guard.canActivate(executionContext(requestFor(initData))),
    ).rejects.toThrow('Invalid user');
  });

  it('rejects a missing user', async () => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      omitUser: true,
    });

    await expect(
      guard.canActivate(executionContext(requestFor(initData))),
    ).rejects.toThrow('Missing user');
  });

  it.each([
    [{ id: 0 }, 'zero'],
    [{ id: -1 }, 'negative'],
    [{ id: 1.5 }, 'non-integer'],
  ])('rejects an invalid user id (%s, %s)', async (user) => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      user: user,
    });

    await expect(
      guard.canActivate(executionContext(requestFor(initData))),
    ).rejects.toThrow('Invalid user');
  });
});
