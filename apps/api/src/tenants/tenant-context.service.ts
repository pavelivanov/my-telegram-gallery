import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TgRequest } from '../auth/request-context';
import type { TenancyMode } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TENANT_ID,
  TENANT_SELECTOR_HEADER,
  TENANT_SLUG_PATTERN,
} from './tenant.constants';
import type { TenantContext } from './tenant-context';

const publicBotSelect = {
  adminAppShortName: true,
  galleryAppShortName: true,
  username: true,
  verifiedAt: true,
} as const;

@Injectable()
export class TenantContextService {
  private readonly mode: TenancyMode;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
  }

  async resolve(request: TgRequest): Promise<TenantContext> {
    if (this.mode === 'single') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: DEFAULT_TENANT_ID },
      });
      if (!tenant) throw new NotFoundException('Gallery not found');
      return this.enforceBotBoundary(request, {
        id: tenant.id,
        mode: this.mode,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        theme: tenant.theme,
        bot: null,
      });
    }

    const header = request.headers[TENANT_SELECTOR_HEADER];
    if (Array.isArray(header)) throw new NotFoundException('Gallery not found');
    if (header !== undefined) {
      return this.enforceBotBoundary(
        request,
        await this.resolveSlug(header.trim()),
      );
    }

    const startParam = request.tgAuth?.startParam;
    const tenantMatch = /^tenant_([a-z0-9][a-z0-9_]{2,29})$/.exec(
      startParam ?? '',
    );
    if (tenantMatch) {
      return this.enforceBotBoundary(
        request,
        await this.resolveSlug(tenantMatch[1]),
      );
    }

    const albumMatch = /^album_([A-Za-z0-9_-]{1,57})$/.exec(startParam ?? '');
    if (albumMatch) {
      const album = await this.prisma.album.findUnique({
        where: { id: albumMatch[1] },
        select: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              theme: true,
              botCredential: { select: publicBotSelect },
            },
          },
        },
      });
      if (!album) throw new NotFoundException('Gallery not found');
      return this.enforceBotBoundary(request, {
        id: album.tenant.id,
        mode: this.mode,
        name: album.tenant.name,
        slug: album.tenant.slug,
        status: album.tenant.status,
        theme: album.tenant.theme,
        bot: album.tenant.botCredential
          ? this.serializeBot(album.tenant.botCredential)
          : null,
      });
    }

    throw new NotFoundException('Gallery not found');
  }

  private async resolveSlug(slug: string): Promise<TenantContext> {
    if (!TENANT_SLUG_PATTERN.test(slug)) {
      throw new NotFoundException('Gallery not found');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        theme: true,
        botCredential: { select: publicBotSelect },
      },
    });
    if (!tenant) throw new NotFoundException('Gallery not found');
    return {
      id: tenant.id,
      mode: this.mode,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      theme: tenant.theme,
      bot: tenant.botCredential
        ? this.serializeBot(tenant.botCredential)
        : null,
    };
  }

  private enforceBotBoundary(
    request: TgRequest,
    tenant: TenantContext,
  ): TenantContext {
    const botTenantId = request.tgAuth?.botTenantId;
    if (botTenantId && botTenantId !== tenant.id) {
      throw new NotFoundException('Gallery not found');
    }
    return tenant;
  }

  private serializeBot(credential: {
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
}
