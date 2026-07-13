import type { Request } from 'express';
import type { TgUser } from './tg-init-data.guard';
import type { TenantContext } from '../tenants/tenant-context';

export interface TgAuthContext {
  authDate: number;
  startParam?: string;
  user: TgUser;
}

export type TgRequest = Request & {
  tgAuth?: TgAuthContext;
  /** Compatibility alias for existing guards and request handlers. */
  tgUser?: TgUser;
  tenantContext?: TenantContext;
};

export function requireTenantContext(request: TgRequest): TenantContext {
  if (!request.tenantContext) {
    throw new Error('Tenant context guard did not run');
  }
  return request.tenantContext;
}
