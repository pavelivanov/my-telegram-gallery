import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TgRequest } from './request-context';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

function executionContext(request: Partial<TgRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  const prisma = {
    tenantMembership: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const guard = new AdminGuard(
    new ConfigService({ ADMIN_TG_IDS: ['1', '42'], TENANCY_MODE: 'single' }),
    prisma,
  );

  it.each([1, 42])('allows configured admin %s', async (id) => {
    const request = {
      headers: {},
      tgAuth: { authDate: 1, user: { id } },
    } as Partial<TgRequest>;

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
  });

  it('supports the compatibility tgUser property', async () => {
    const request = { headers: {}, tgUser: { id: 42 } } as Partial<TgRequest>;

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
  });

  it.each([
    [{ headers: {} }, 'missing user'],
    [{ headers: {}, tgAuth: { authDate: 1, user: { id: 7 } } }, 'non-admin'],
  ])('rejects %s (%s)', async (request) => {
    await expect(
      guard.canActivate(executionContext(request as Partial<TgRequest>)),
    ).rejects.toEqual(new ForbiddenException('Admin only'));
  });

  it('requires an administrator membership in multi mode', async () => {
    const memberships = { findUnique: jest.fn().mockResolvedValue(null) };
    const multiGuard = new AdminGuard(
      new ConfigService({ ADMIN_TG_IDS: [], TENANCY_MODE: 'multi' }),
      { tenantMembership: memberships } as unknown as PrismaService,
    );
    const request = {
      headers: {},
      tgAuth: { authDate: 1, user: { id: 7 } },
      tenantContext: {
        id: 'tenant-1',
        mode: 'multi',
        slug: 'tenant_one',
        status: 'ACTIVE',
      },
    } as Partial<TgRequest>;

    await expect(
      multiGuard.canActivate(executionContext(request)),
    ).rejects.toEqual(
      new ForbiddenException('Tenant administrator access required'),
    );
    expect(memberships.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_tgUserId: { tenantId: 'tenant-1', tgUserId: 7n },
      },
    });
  });

  it.each(['OWNER', 'ADMIN'])(
    'allows a multi-tenant %s membership',
    async (role) => {
      const memberships = {
        findUnique: jest.fn().mockResolvedValue({ role }),
      };
      const multiGuard = new AdminGuard(
        new ConfigService({ ADMIN_TG_IDS: [], TENANCY_MODE: 'multi' }),
        { tenantMembership: memberships } as unknown as PrismaService,
      );
      const request = {
        headers: {},
        tgAuth: { authDate: 1, user: { id: 7 } },
        tenantContext: {
          id: 'tenant-1',
          mode: 'multi',
          slug: 'tenant_one',
          status: 'ACTIVE',
        },
      } as Partial<TgRequest>;

      await expect(
        multiGuard.canActivate(executionContext(request)),
      ).resolves.toBe(true);
    },
  );
});
