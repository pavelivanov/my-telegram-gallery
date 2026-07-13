export const DEFAULT_TENANT_ID = 'tenant_default';
export const DEFAULT_TENANT_SLUG = 'default';
export const TENANT_SELECTOR_HEADER = 'x-tenant-slug';
export const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9_]{2,29}$/;
export const RESERVED_TENANT_SLUGS = new Set([
  'admin',
  'api',
  'default',
  'product',
  'system',
]);
