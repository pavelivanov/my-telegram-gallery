import { NotFoundException } from '@nestjs/common';
import type { TenantStatus } from '../../generated/prisma/client';
import type { TenancyMode } from '../config/env';

export interface TenantContext {
  id: string;
  mode: TenancyMode;
  slug: string;
  status: TenantStatus;
}

export function assertTenantReadable(context: TenantContext): void {
  if (context.status !== 'ACTIVE') {
    throw new NotFoundException('Gallery not found');
  }
}
