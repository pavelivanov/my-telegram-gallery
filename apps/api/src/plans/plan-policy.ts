import { TenantPlan } from '../../generated/prisma/client';

const MIB = 1024n * 1024n;
const GIB = 1024n * MIB;

export interface PlanPolicy {
  readonly maxTenantsPerOwner: number;
  readonly maxAlbums: number;
  readonly maxPhotos: number;
  readonly maxStorageBytes: bigint;
  readonly maxUploadBytes: number;
}

export const PLAN_POLICY_VERSION = '2026-07-13.v1';
export const PAID_PLAN_GRACE_DAYS = 7;
export const SUSPENDED_OWNER_READABLE = true;
export const SUSPENDED_PUBLIC_READABLE = false;

export const PLAN_POLICIES: Readonly<Record<TenantPlan, PlanPolicy>> = {
  [TenantPlan.FREE]: {
    maxTenantsPerOwner: 1,
    maxAlbums: 1,
    maxPhotos: 100,
    maxStorageBytes: 200n * MIB,
    maxUploadBytes: 20 * Number(MIB),
  },
  [TenantPlan.PRO]: {
    maxTenantsPerOwner: 10,
    maxAlbums: 100,
    maxPhotos: 10_000,
    maxStorageBytes: 100n * GIB,
    maxUploadBytes: 50 * Number(MIB),
  },
};

export function getPlanPolicy(plan: TenantPlan): PlanPolicy {
  return PLAN_POLICIES[plan];
}

export function validatePlanPolicies(
  policies: Readonly<Record<TenantPlan, PlanPolicy>> = PLAN_POLICIES,
): void {
  for (const [plan, policy] of Object.entries(policies)) {
    if (
      !Number.isSafeInteger(policy.maxTenantsPerOwner) ||
      policy.maxTenantsPerOwner < 1 ||
      !Number.isSafeInteger(policy.maxAlbums) ||
      policy.maxAlbums < 1 ||
      !Number.isSafeInteger(policy.maxPhotos) ||
      policy.maxPhotos < 1 ||
      policy.maxStorageBytes < 1n ||
      !Number.isSafeInteger(policy.maxUploadBytes) ||
      policy.maxUploadBytes < 1 ||
      BigInt(policy.maxUploadBytes) > policy.maxStorageBytes
    ) {
      throw new Error(`Invalid ${plan} plan policy`);
    }
  }

  const free = policies[TenantPlan.FREE];
  const pro = policies[TenantPlan.PRO];
  if (
    pro.maxTenantsPerOwner < free.maxTenantsPerOwner ||
    pro.maxAlbums < free.maxAlbums ||
    pro.maxPhotos < free.maxPhotos ||
    pro.maxStorageBytes < free.maxStorageBytes ||
    pro.maxUploadBytes < free.maxUploadBytes
  ) {
    throw new Error('PRO plan policy must not be lower than FREE');
  }
}

validatePlanPolicies();
