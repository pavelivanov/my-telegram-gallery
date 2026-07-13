import { NotFoundException } from '@nestjs/common';
import type { GalleryTheme, TenantStatus } from '../../generated/prisma/client';
import type { TenancyMode } from '../config/env';

export interface TenantContext {
  id: string;
  mode: TenancyMode;
  name: string;
  slug: string;
  status: TenantStatus;
  theme: GalleryTheme;
}

export function assertTenantReadable(context: TenantContext): void {
  if (context.status !== 'ACTIVE') {
    throw new NotFoundException('Gallery not found');
  }
}
