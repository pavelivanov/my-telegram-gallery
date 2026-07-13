import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TgRequest } from './request-context';
import { AdminGuard } from './admin.guard';

function executionContext(request: Partial<TgRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard(
    new ConfigService({ ADMIN_TG_IDS: ['1', '42'] }),
  );

  it.each([1, 42])('allows configured admin %s', (id) => {
    const request = {
      headers: {},
      tgAuth: { authDate: 1, user: { id } },
    } as Partial<TgRequest>;

    expect(guard.canActivate(executionContext(request))).toBe(true);
  });

  it('supports the compatibility tgUser property', () => {
    const request = { headers: {}, tgUser: { id: 42 } } as Partial<TgRequest>;

    expect(guard.canActivate(executionContext(request))).toBe(true);
  });

  it.each([
    [{ headers: {} }, 'missing user'],
    [{ headers: {}, tgAuth: { authDate: 1, user: { id: 7 } } }, 'non-admin'],
  ])('rejects %s (%s)', (request) => {
    expect(() =>
      guard.canActivate(executionContext(request as Partial<TgRequest>)),
    ).toThrow(new ForbiddenException('Admin only'));
  });
});
