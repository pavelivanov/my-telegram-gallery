import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TenantRole } from '../../generated/prisma/client';
import type { TgAuthContext } from '../auth/request-context';
import type { TenancyMode } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import {
  TelegramApiError,
  TelegramApiService,
} from '../telegram/telegram-api.service';
import type { ConnectTenantBotDto } from './tenant-bots.dto';
import { TenantBotCryptoService } from './tenant-bot-crypto.service';

const TENANT_START_PATTERN = /^tenant_([a-z0-9][a-z0-9_]{2,29})$/;
const ALBUM_START_PATTERN = /^album_([A-Za-z0-9_-]{1,57})$/;

const publicCredentialSelect = {
  adminAppShortName: true,
  galleryAppShortName: true,
  username: true,
  verifiedAt: true,
} satisfies Prisma.TenantBotCredentialSelect;

const authCredentialSelect = {
  keyId: true,
  tenantId: true,
  tokenAuthTag: true,
  tokenCiphertext: true,
  tokenIv: true,
} satisfies Prisma.TenantBotCredentialSelect;

@Injectable()
export class TenantBotsService {
  private readonly mode: TenancyMode;

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly crypto: TenantBotCryptoService,
    private readonly telegram: TelegramApiService,
    config: ConfigService,
  ) {
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
  }

  async getStatus(auth: TgAuthContext, slug: string) {
    const tenant = await this.requireOwned(auth, slug);
    const credential = await this.prisma.tenantBotCredential.findUnique({
      where: { tenantId: tenant.id },
      select: publicCredentialSelect,
    });
    return this.serializeStatus(credential);
  }

  async connect(auth: TgAuthContext, slug: string, dto: ConnectTenantBotDto) {
    const owned = await this.requireOwned(auth, slug);
    if (!this.crypto.configured) {
      // The crypto service gives the stable operator-facing error.
      this.crypto.encrypt(owned.id, dto.botToken);
    }
    let verified: Awaited<ReturnType<TelegramApiService['verifyBotToken']>>;
    try {
      verified = await this.telegram.verifyBotToken(dto.botToken);
    } catch (error) {
      if (error instanceof TelegramApiError) {
        if (error.retryable) {
          throw new ServiceUnavailableException(
            'Telegram could not verify this bot token. Try again shortly.',
          );
        }
        throw new BadRequestException('Telegram rejected this bot token');
      }
      throw error;
    }
    const encrypted = this.crypto.encrypt(owned.id, dto.botToken);

    try {
      const credential = await this.quota.withTenantLock(
        owned.id,
        async (transaction, tenant) => {
          this.quota.assertMutable(tenant);
          await this.requireOwnerMembership(
            transaction,
            tenant.id,
            BigInt(auth.user.id),
          );
          return transaction.tenantBotCredential.upsert({
            where: { tenantId: tenant.id },
            create: {
              tenantId: tenant.id,
              telegramBotId: verified.id,
              username: verified.username,
              adminAppShortName: dto.adminAppShortName,
              galleryAppShortName: dto.galleryAppShortName,
              verifiedAt: new Date(),
              ...encrypted,
            },
            update: {
              telegramBotId: verified.id,
              username: verified.username,
              adminAppShortName: dto.adminAppShortName,
              galleryAppShortName: dto.galleryAppShortName,
              verifiedAt: new Date(),
              ...encrypted,
            },
            select: publicCredentialSelect,
          });
        },
      );
      return this.serializeStatus(credential);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This Telegram bot is already connected to another gallery',
        );
      }
      throw error;
    }
  }

  async disconnect(auth: TgAuthContext, slug: string) {
    const owned = await this.requireOwned(auth, slug);
    await this.quota.withTenantLock(owned.id, async (transaction, tenant) => {
      this.quota.assertMutable(tenant);
      await this.requireOwnerMembership(
        transaction,
        tenant.id,
        BigInt(auth.user.id),
      );
      await transaction.tenantBotCredential.deleteMany({
        where: { tenantId: tenant.id },
      });
    });
    return this.serializeStatus(null);
  }

  async resolveAuthCredential(startParam: string | undefined): Promise<{
    tenantId: string;
    token: string;
  } | null> {
    if (!this.crypto.configured || !startParam) return null;

    let credential: Prisma.TenantBotCredentialGetPayload<{
      select: typeof authCredentialSelect;
    }> | null = null;
    const tenantMatch = TENANT_START_PATTERN.exec(startParam);
    if (tenantMatch) {
      credential = await this.prisma.tenantBotCredential.findFirst({
        where: { tenant: { slug: tenantMatch[1] } },
        select: authCredentialSelect,
      });
    } else {
      const albumMatch = ALBUM_START_PATTERN.exec(startParam);
      if (!albumMatch) return null;
      const album = await this.prisma.album.findUnique({
        where: { id: albumMatch[1] },
        select: {
          tenant: {
            select: { botCredential: { select: authCredentialSelect } },
          },
        },
      });
      credential = album?.tenant.botCredential ?? null;
    }
    if (!credential) return null;

    try {
      return {
        tenantId: credential.tenantId,
        token: this.crypto.decrypt(credential),
      };
    } catch {
      // A missing/retired key or tampered row must never become an auth bypass.
      return null;
    }
  }

  static serializePublic(credential: {
    adminAppShortName: string;
    galleryAppShortName: string;
    username: string;
    verifiedAt: Date;
  }) {
    return {
      username: credential.username,
      adminAppShortName: credential.adminAppShortName,
      galleryAppShortName: credential.galleryAppShortName,
      verifiedAt: credential.verifiedAt,
    };
  }

  private serializeStatus(
    credential: Prisma.TenantBotCredentialGetPayload<{
      select: typeof publicCredentialSelect;
    }> | null,
  ) {
    return {
      configured: this.mode === 'multi' && this.crypto.configured,
      connected: credential !== null,
      bot: credential ? TenantBotsService.serializePublic(credential) : null,
    };
  }

  private async requireOwned(auth: TgAuthContext, slug: string) {
    if (this.mode !== 'multi') {
      throw new ForbiddenException('Tenant bot connections require multi mode');
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug,
        memberships: {
          some: {
            role: TenantRole.OWNER,
            tgUserId: BigInt(auth.user.id),
          },
        },
      },
      select: { id: true },
    });
    if (!tenant || (auth.botTenantId && auth.botTenantId !== tenant.id)) {
      throw new NotFoundException('Gallery not found');
    }
    return tenant;
  }

  private async requireOwnerMembership(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    tgUserId: bigint,
  ) {
    const membership = await transaction.tenantMembership.findUnique({
      where: { tenantId_tgUserId: { tenantId, tgUserId } },
      select: { role: true },
    });
    if (membership?.role !== TenantRole.OWNER) {
      throw new ForbiddenException('Tenant owner access required');
    }
  }
}
