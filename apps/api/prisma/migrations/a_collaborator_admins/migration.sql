-- Owners can delegate gallery content management without delegating billing or
-- ownership. Existing memberships remain OWNER.
ALTER TYPE "TenantRole" ADD VALUE 'ADMIN';
