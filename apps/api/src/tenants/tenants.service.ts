import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TenantRole } from '../../generated/prisma/client';
import type { TgUser } from '../auth/tg-init-data.guard';
import type { TenancyMode } from '../config/env';
import { getPlanPolicy, PLAN_POLICY_VERSION } from '../plans/plan-policy';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaException } from '../quota/quota.errors';
import { QuotaService } from '../quota/quota.service';
import { DEFAULT_TENANT_SLUG, RESERVED_TENANT_SLUGS } from './tenant.constants';

@Injectable()
export class TenantsService {
  private readonly adminIds: readonly string[];
  private readonly mode: TenancyMode;

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    config: ConfigService,
  ) {
    this.adminIds = config.getOrThrow<readonly string[]>('ADMIN_TG_IDS');
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
  }

  async listOwned(user: TgUser) {
    if (this.mode === 'single') {
      this.assertSingleAdmin(user);
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: DEFAULT_TENANT_SLUG },
      });
      return tenant ? [this.serialize(tenant)] : [];
    }

    const tenants = await this.prisma.tenant.findMany({
      where: {
        memberships: {
          some: { role: TenantRole.OWNER, tgUserId: BigInt(user.id) },
        },
      },
      orderBy: [{ name: 'asc' }, { slug: 'asc' }],
    });
    return tenants.map((tenant) => this.serialize(tenant));
  }

  async create(user: TgUser, nameRaw: string, slug: string) {
    if (this.mode !== 'multi') {
      throw new ForbiddenException('Tenant creation requires multi mode');
    }
    if (RESERVED_TENANT_SLUGS.has(slug)) {
      throw new ConflictException('Tenant slug is reserved');
    }
    const name = nameRaw.trim();
    if (!name) throw new ConflictException('Tenant name is required');

    try {
      const ownerTgUserId = BigInt(user.id);
      const tenant = await this.quota.withOwnerLock(
        ownerTgUserId,
        async (transaction) => {
          const owned = await transaction.tenant.findMany({
            where: {
              memberships: {
                some: {
                  role: TenantRole.OWNER,
                  tgUserId: ownerTgUserId,
                },
              },
            },
            select: { plan: true },
          });
          const maximumTenants = owned.reduce(
            (maximum, item) =>
              Math.max(maximum, getPlanPolicy(item.plan).maxTenantsPerOwner),
            getPlanPolicy('FREE').maxTenantsPerOwner,
          );
          if (owned.length >= maximumTenants) {
            throw new QuotaException('QUOTA_TENANTS');
          }
          return transaction.tenant.create({
            data: {
              name,
              slug,
              memberships: {
                create: { role: TenantRole.OWNER, tgUserId: ownerTgUserId },
              },
            },
          });
        },
      );
      return this.serialize(tenant);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tenant slug already exists');
      }
      throw error;
    }
  }

  async getOwned(user: TgUser, slug: string) {
    if (this.mode === 'single') {
      this.assertSingleAdmin(user);
      if (slug !== DEFAULT_TENANT_SLUG) throw new NotFoundException();
      const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) throw new NotFoundException();
      return this.serialize(tenant);
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug,
        memberships: {
          some: { role: TenantRole.OWNER, tgUserId: BigInt(user.id) },
        },
      },
    });
    if (!tenant) throw new NotFoundException();
    return this.serialize(tenant);
  }

  private assertSingleAdmin(user: TgUser): void {
    if (!this.adminIds.includes(String(user.id))) {
      throw new ForbiddenException('Admin only');
    }
  }

  private serialize(tenant: {
    createdAt: Date;
    id: string;
    name: string;
    plan: string;
    slug: string;
    storageReservedBytes: bigint;
    storageUsedBytes: bigint;
    albumCount: number;
    photoCount: number;
    status: string;
    updatedAt: Date;
  }) {
    const policy = getPlanPolicy(tenant.plan as 'FREE' | 'PRO');
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status.toLowerCase(),
      plan: tenant.plan.toLowerCase(),
      policyVersion: PLAN_POLICY_VERSION,
      usage: {
        albumCount: tenant.albumCount,
        albumLimit: policy.maxAlbums,
        photoCount: tenant.photoCount,
        photoLimit: policy.maxPhotos,
        storageUsedBytes: tenant.storageUsedBytes.toString(),
        storageReservedBytes: tenant.storageReservedBytes.toString(),
        storageLimitBytes: policy.maxStorageBytes.toString(),
      },
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}
