import { TenantPlan } from '../../generated/prisma/client';
import {
  getPlanPolicy,
  PLAN_POLICIES,
  validatePlanPolicies,
} from './plan-policy';

describe('plan policy', () => {
  it('provides validated Free and Pro policies from one table', () => {
    expect(() => validatePlanPolicies()).not.toThrow();
    expect(getPlanPolicy(TenantPlan.FREE).maxAlbums).toBe(1);
    expect(getPlanPolicy(TenantPlan.FREE).maxPhotos).toBe(100);
    expect(getPlanPolicy(TenantPlan.PRO).maxStorageBytes).toBeGreaterThan(
      getPlanPolicy(TenantPlan.FREE).maxStorageBytes,
    );
  });

  it('rejects inconsistent policy changes', () => {
    expect(() =>
      validatePlanPolicies({
        ...PLAN_POLICIES,
        [TenantPlan.PRO]: {
          ...PLAN_POLICIES[TenantPlan.PRO],
          maxStorageBytes: 0n,
        },
      }),
    ).toThrow('Invalid PRO plan policy');
  });
});
