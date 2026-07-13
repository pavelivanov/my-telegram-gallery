import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTelegramInitData } from '../../test/helpers/telegram-init-data';
import type { TgRequest } from './request-context';
import { TgInitDataGuard } from './tg-init-data.guard';

const BOT_TOKEN = '123456:test-only-token';

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
  const guard = new TgInitDataGuard(config);

  it('accepts fresh signed data and attaches typed auth context', () => {
    const request = requestFor(
      createTelegramInitData({
        botToken: BOT_TOKEN,
        startParam: 'album_123',
        user: { id: 42, first_name: 'Admin' },
      }),
    );

    expect(guard.canActivate(executionContext(request))).toBe(true);
    expect(request.tgAuth).toMatchObject({
      startParam: 'album_123',
      user: { id: 42, first_name: 'Admin' },
    });
    expect(request.tgUser).toEqual(request.tgAuth?.user);
  });

  it('rejects a missing authorization header', () => {
    expect(() => guard.canActivate(executionContext(requestFor()))).toThrow(
      new UnauthorizedException('Missing tma init data'),
    );
  });

  it('rejects a bad signature', () => {
    const params = new URLSearchParams(
      createTelegramInitData({ botToken: BOT_TOKEN }),
    );
    params.set('hash', '0'.repeat(64));

    expect(() =>
      guard.canActivate(executionContext(requestFor(params.toString()))),
    ).toThrow('Invalid init data signature');
  });

  it('rejects a malformed signature before comparing it', () => {
    const params = new URLSearchParams(
      createTelegramInitData({ botToken: BOT_TOKEN }),
    );
    params.set('hash', 'not-hex');

    expect(() =>
      guard.canActivate(executionContext(requestFor(params.toString()))),
    ).toThrow('Invalid init data signature');
  });

  it('rejects stale init data', () => {
    const initData = createTelegramInitData({
      authDate: Math.floor(Date.now() / 1000) - 3601,
      botToken: BOT_TOKEN,
    });

    expect(() =>
      guard.canActivate(executionContext(requestFor(initData))),
    ).toThrow('Init data has expired');
  });

  it('rejects init data too far in the future', () => {
    const initData = createTelegramInitData({
      authDate: Math.floor(Date.now() / 1000) + 31,
      botToken: BOT_TOKEN,
    });

    expect(() =>
      guard.canActivate(executionContext(requestFor(initData))),
    ).toThrow('Init data is from the future');
  });

  it('rejects a missing auth date', () => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      omitAuthDate: true,
    });

    expect(() =>
      guard.canActivate(executionContext(requestFor(initData))),
    ).toThrow('Invalid auth date');
  });

  it('rejects malformed user JSON as unauthorized', () => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      userRaw: '{bad-json',
    });

    expect(() =>
      guard.canActivate(executionContext(requestFor(initData))),
    ).toThrow('Invalid user');
  });

  it('rejects a missing user', () => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      omitUser: true,
    });

    expect(() =>
      guard.canActivate(executionContext(requestFor(initData))),
    ).toThrow('Missing user');
  });

  it.each([
    [{ id: 0 }, 'zero'],
    [{ id: -1 }, 'negative'],
    [{ id: 1.5 }, 'non-integer'],
  ])('rejects an invalid user id (%s, %s)', (user) => {
    const initData = createTelegramInitData({
      botToken: BOT_TOKEN,
      user: user,
    });

    expect(() =>
      guard.canActivate(executionContext(requestFor(initData))),
    ).toThrow('Invalid user');
  });
});
