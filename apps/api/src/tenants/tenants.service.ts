import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  GalleryTheme,
  Prisma,
  ReportStatus,
  TenantRole,
} from '../../generated/prisma/client';
import type { TgUser } from '../auth/tg-init-data.guard';
import type { TenancyMode } from '../config/env';
import { getPlanPolicy, PLAN_POLICY_VERSION } from '../plans/plan-policy';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaException } from '../quota/quota.errors';
import { QuotaService } from '../quota/quota.service';
import { assertTenantReadable, type TenantContext } from './tenant-context';
import {
  DEFAULT_TENANT_SLUG,
  MAX_COLLABORATOR_ADMINS,
  RESERVED_TENANT_SLUGS,
} from './tenant.constants';

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

  async listAccessible(user: TgUser, botTenantId?: string) {
    if (this.mode === 'single') {
      this.assertSingleAdmin(user);
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: DEFAULT_TENANT_SLUG },
        include: {
          botCredential: {
            select: {
              username: true,
              adminAppShortName: true,
              galleryAppShortName: true,
              verifiedAt: true,
            },
          },
          _count: {
            select: { reports: { where: { status: ReportStatus.OPEN } } },
          },
        },
      });
      return tenant ? [this.serialize(tenant, TenantRole.OWNER)] : [];
    }

    const tgUserId = BigInt(user.id);
    const tenants = await this.prisma.tenant.findMany({
      where: {
        ...(botTenantId ? { id: botTenantId } : {}),
        memberships: {
          some: { tgUserId },
        },
      },
      orderBy: [{ name: 'asc' }, { slug: 'asc' }],
      include: {
        botCredential: {
          select: {
            username: true,
            adminAppShortName: true,
            galleryAppShortName: true,
            verifiedAt: true,
          },
        },
        memberships: {
          where: { tgUserId },
          select: { role: true },
        },
        _count: {
          select: { reports: { where: { status: ReportStatus.OPEN } } },
        },
      },
    });
    return tenants.map((tenant) =>
      this.serialize(tenant, tenant.memberships[0]?.role),
    );
  }

  async create(
    user: TgUser,
    nameRaw: string,
    slug: string,
    botTenantId?: string,
  ) {
    if (this.mode !== 'multi') {
      throw new ForbiddenException('Tenant creation requires multi mode');
    }
    if (botTenantId) {
      throw new ForbiddenException('Create galleries through the service bot');
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
      return this.serialize(tenant, TenantRole.OWNER);
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

  async getAccessible(user: TgUser, slug: string, botTenantId?: string) {
    if (this.mode === 'single') {
      this.assertSingleAdmin(user);
      if (slug !== DEFAULT_TENANT_SLUG) throw new NotFoundException();
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        include: {
          botCredential: {
            select: {
              username: true,
              adminAppShortName: true,
              galleryAppShortName: true,
              verifiedAt: true,
            },
          },
          _count: {
            select: { reports: { where: { status: ReportStatus.OPEN } } },
          },
        },
      });
      if (!tenant) throw new NotFoundException();
      return this.serialize(tenant, TenantRole.OWNER);
    }

    const tgUserId = BigInt(user.id);
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        ...(botTenantId ? { id: botTenantId } : {}),
        slug,
        memberships: {
          some: { tgUserId },
        },
      },
      include: {
        botCredential: {
          select: {
            username: true,
            adminAppShortName: true,
            galleryAppShortName: true,
            verifiedAt: true,
          },
        },
        memberships: {
          where: { tgUserId },
          select: { role: true },
        },
        _count: {
          select: { reports: { where: { status: ReportStatus.OPEN } } },
        },
      },
    });
    if (!tenant) throw new NotFoundException();
    return this.serialize(tenant, tenant.memberships[0]?.role);
  }

  getPresentation(context: TenantContext) {
    assertTenantReadable(context);
    return {
      name: context.name,
      slug: context.slug,
      theme: context.theme.toLowerCase(),
      bot: context.bot,
    };
  }

  async updateTheme(
    user: TgUser,
    slug: string,
    theme: GalleryTheme,
    botTenantId?: string,
  ) {
    const tenant = await this.requireAdminTenant(user, slug, botTenantId);
    const tgUserId = BigInt(user.id);

    return this.quota.withTenantLock(
      tenant.id,
      async (transaction, lockedTenant) => {
        this.quota.assertMutable(lockedTenant);
        if (this.mode === 'multi') {
          await this.requireAdminMembership(
            transaction,
            lockedTenant.id,
            tgUserId,
          );
        }
        const updated = await transaction.tenant.update({
          where: { id: lockedTenant.id },
          data: { theme },
          select: { theme: true },
        });
        return { theme: updated.theme.toLowerCase() };
      },
    );
  }

  async getPublicShare(user: TgUser, slug: string, botTenantId?: string) {
    const owner = await this.requireShareOwner(user, slug, botTenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: owner.id },
      select: { publicShareId: true },
    });
    if (!tenant) throw new NotFoundException('Gallery not found');
    return this.serializePublicShare(tenant.publicShareId);
  }

  async enablePublicShare(user: TgUser, slug: string, botTenantId?: string) {
    return this.changePublicShare(user, slug, true, botTenantId);
  }

  async disablePublicShare(user: TgUser, slug: string, botTenantId?: string) {
    return this.changePublicShare(user, slug, false, botTenantId);
  }

  async listMembers(user: TgUser, slug: string, botTenantId?: string) {
    const tenant = await this.requireOwnedTenant(user, slug, botTenantId);
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { tgUserId: 'asc' }],
    });
    return {
      adminLimit: MAX_COLLABORATOR_ADMINS,
      members: memberships.map((membership) =>
        this.serializeMembership(membership),
      ),
    };
  }

  async addAdmin(
    user: TgUser,
    slug: string,
    tgUserIdRaw: string,
    botTenantId?: string,
  ) {
    const tgUserId = this.parseTgUserId(tgUserIdRaw);
    const ownerTgUserId = BigInt(user.id);
    const owned = await this.requireOwnedTenant(user, slug, botTenantId);

    try {
      return await this.quota.withTenantLock(
        owned.id,
        async (transaction, tenant) => {
          this.quota.assertMutable(tenant);
          await this.requireOwnerMembership(
            transaction,
            tenant.id,
            ownerTgUserId,
          );
          const adminCount = await transaction.tenantMembership.count({
            where: { tenantId: tenant.id, role: TenantRole.ADMIN },
          });
          if (adminCount >= MAX_COLLABORATOR_ADMINS) {
            throw new QuotaException('QUOTA_ADMINS');
          }
          const membership = await transaction.tenantMembership.create({
            data: { tenantId: tenant.id, tgUserId, role: TenantRole.ADMIN },
          });
          return this.serializeMembership(membership);
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Telegram user is already a member');
      }
      throw error;
    }
  }

  async removeAdmin(
    user: TgUser,
    slug: string,
    tgUserIdRaw: string,
    botTenantId?: string,
  ) {
    const tgUserId = this.parseTgUserId(tgUserIdRaw);
    const ownerTgUserId = BigInt(user.id);
    const owned = await this.requireOwnedTenant(user, slug, botTenantId);

    return this.quota.withTenantLock(owned.id, async (transaction, tenant) => {
      this.quota.assertMutable(tenant);
      await this.requireOwnerMembership(transaction, tenant.id, ownerTgUserId);
      const removed = await transaction.tenantMembership.deleteMany({
        where: {
          tenantId: tenant.id,
          tgUserId,
          role: TenantRole.ADMIN,
        },
      });
      if (removed.count !== 1) {
        throw new NotFoundException('Collaborator not found');
      }
      return { removed: true, tgUserId: tgUserId.toString() };
    });
  }

  private assertSingleAdmin(user: TgUser): void {
    if (!this.adminIds.includes(String(user.id))) {
      throw new ForbiddenException('Admin only');
    }
  }

  private async requireOwnedTenant(
    user: TgUser,
    slug: string,
    botTenantId?: string,
  ) {
    if (this.mode !== 'multi') {
      throw new ForbiddenException('Collaborators require multi mode');
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        ...(botTenantId ? { id: botTenantId } : {}),
        slug,
        memberships: {
          some: { role: TenantRole.OWNER, tgUserId: BigInt(user.id) },
        },
      },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Gallery not found');
    return tenant;
  }

  private async requireAdminTenant(
    user: TgUser,
    slug: string,
    botTenantId?: string,
  ) {
    if (this.mode === 'single') {
      this.assertSingleAdmin(user);
      if (slug !== DEFAULT_TENANT_SLUG) {
        throw new NotFoundException('Gallery not found');
      }
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!tenant) throw new NotFoundException('Gallery not found');
      return tenant;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        ...(botTenantId ? { id: botTenantId } : {}),
        slug,
        memberships: { some: { tgUserId: BigInt(user.id) } },
      },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Gallery not found');
    return tenant;
  }

  private async requireShareOwner(
    user: TgUser,
    slug: string,
    botTenantId?: string,
  ) {
    if (this.mode === 'single') {
      this.assertSingleAdmin(user);
      if (slug !== DEFAULT_TENANT_SLUG) {
        throw new NotFoundException('Gallery not found');
      }
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!tenant) throw new NotFoundException('Gallery not found');
      return tenant;
    }
    return this.requireOwnedTenant(user, slug, botTenantId);
  }

  private async changePublicShare(
    user: TgUser,
    slug: string,
    enabled: boolean,
    botTenantId?: string,
  ) {
    const owner = await this.requireShareOwner(user, slug, botTenantId);
    const ownerTgUserId = BigInt(user.id);
    return this.quota.withTenantLock(
      owner.id,
      async (transaction, lockedTenant) => {
        this.quota.assertMutable(lockedTenant);
        if (this.mode === 'multi') {
          await this.requireOwnerMembership(
            transaction,
            lockedTenant.id,
            ownerTgUserId,
          );
        }
        if (enabled && lockedTenant.publicShareId) {
          return this.serializePublicShare(lockedTenant.publicShareId);
        }
        const publicShareId = enabled
          ? randomBytes(24).toString('base64url')
          : null;
        await transaction.tenant.update({
          where: { id: lockedTenant.id },
          data: { publicShareId },
        });
        return this.serializePublicShare(publicShareId);
      },
    );
  }

  private async requireOwnerMembership(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    tgUserId: bigint,
  ): Promise<void> {
    const membership = await transaction.tenantMembership.findUnique({
      where: { tenantId_tgUserId: { tenantId, tgUserId } },
      select: { role: true },
    });
    if (membership?.role !== TenantRole.OWNER) {
      throw new ForbiddenException('Tenant owner access required');
    }
  }

  private async requireAdminMembership(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    tgUserId: bigint,
  ): Promise<void> {
    const membership = await transaction.tenantMembership.findUnique({
      where: { tenantId_tgUserId: { tenantId, tgUserId } },
      select: { role: true },
    });
    if (
      membership?.role !== TenantRole.OWNER &&
      membership?.role !== TenantRole.ADMIN
    ) {
      throw new ForbiddenException('Tenant admin access required');
    }
  }

  private parseTgUserId(value: string): bigint {
    if (!/^[1-9]\d{0,15}$/.test(value)) {
      throw new BadRequestException('Invalid Telegram user ID');
    }
    const parsed = BigInt(value);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException('Invalid Telegram user ID');
    }
    return parsed;
  }

  private serializeMembership(membership: {
    createdAt: Date;
    role: TenantRole;
    tgUserId: bigint;
  }) {
    return {
      tgUserId: membership.tgUserId.toString(),
      role: membership.role.toLowerCase(),
      createdAt: membership.createdAt,
    };
  }

  private serializePublicShare(publicShareId: string | null) {
    return {
      enabled: publicShareId !== null,
      shareId: publicShareId,
    };
  }

  private serialize(
    tenant: {
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
      theme: GalleryTheme;
      updatedAt: Date;
      botCredential?: {
        adminAppShortName: string;
        galleryAppShortName: string;
        username: string;
        verifiedAt: Date;
      } | null;
      _count?: { reports: number };
    },
    role: TenantRole | undefined,
  ) {
    const policy = getPlanPolicy(tenant.plan as 'FREE' | 'PRO');
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      role: (role ?? TenantRole.ADMIN).toLowerCase(),
      status: tenant.status.toLowerCase(),
      plan: tenant.plan.toLowerCase(),
      theme: tenant.theme.toLowerCase(),
      bot: tenant.botCredential
        ? {
            username: tenant.botCredential.username,
            adminAppShortName: tenant.botCredential.adminAppShortName,
            galleryAppShortName: tenant.botCredential.galleryAppShortName,
            verifiedAt: tenant.botCredential.verifiedAt,
          }
        : null,
      policyVersion: PLAN_POLICY_VERSION,
      openReportCount: tenant._count?.reports ?? 0,
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
