import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OperatorAuditAction,
  ReportStatus,
  TenantStatus,
} from '../../generated/prisma/client';
import { getPlanPolicy, PLAN_POLICY_VERSION } from '../plans/plan-policy';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly billing: BillingService,
  ) {}

  async listOpenReports(limit: number) {
    const reports = await this.prisma.report.findMany({
      where: { status: ReportStatus.OPEN },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return reports.map((report) => ({
      id: report.id,
      tenantId: report.tenantId,
      reporterTgUserId: report.reporterTgUserId.toString(),
      albumId: report.albumId,
      photoId: report.photoId,
      reason: report.reason,
      detail: report.detail,
      createdAt: report.createdAt,
    }));
  }

  async inspectTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const policy = getPlanPolicy(tenant.plan);
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      policyVersion: PLAN_POLICY_VERSION,
      albumCount: tenant.albumCount,
      albumLimit: policy.maxAlbums,
      photoCount: tenant.photoCount,
      photoLimit: policy.maxPhotos,
      storageUsedBytes: tenant.storageUsedBytes.toString(),
      storageReservedBytes: tenant.storageReservedBytes.toString(),
      storageLimitBytes: policy.maxStorageBytes.toString(),
    };
  }

  async setTenantSuspension(
    slug: string,
    suspended: boolean,
    actor: string,
    reason: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.quota.withTenantLock(tenant.id, async (transaction, locked) => {
      const status = suspended ? TenantStatus.SUSPENDED : TenantStatus.ACTIVE;
      const action = suspended
        ? OperatorAuditAction.TENANT_SUSPENDED
        : OperatorAuditAction.TENANT_UNSUSPENDED;
      await transaction.tenant.update({
        where: { id: locked.id },
        data: { status },
      });
      const audit = await transaction.operatorAudit.create({
        data: { actor, action, tenantId: locked.id, reason },
      });
      return { tenantId: locked.id, status, auditId: audit.id };
    });
  }

  async closeReport(
    reportId: string,
    status: 'resolved' | 'dismissed',
    actor: string,
    note: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { tenantId: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    return this.quota.withTenantLock(
      report.tenantId,
      async (transaction, tenant) => {
        const nextStatus =
          status === 'resolved'
            ? ReportStatus.RESOLVED
            : ReportStatus.DISMISSED;
        const action =
          status === 'resolved'
            ? OperatorAuditAction.REPORT_RESOLVED
            : OperatorAuditAction.REPORT_DISMISSED;
        const updated = await transaction.report.updateMany({
          where: {
            id: reportId,
            tenantId: tenant.id,
            status: ReportStatus.OPEN,
          },
          data: { status: nextStatus, staffNote: note, resolvedAt: new Date() },
        });
        if (updated.count !== 1) {
          throw new NotFoundException('Open report not found');
        }
        const audit = await transaction.operatorAudit.create({
          data: {
            actor,
            action,
            tenantId: tenant.id,
            reportId,
            reason: note,
          },
        });
        return { reportId, status: nextStatus, auditId: audit.id };
      },
    );
  }

  refundPayment(paymentId: string, actor: string, reason: string) {
    return this.billing.refundPayment(paymentId, actor, reason);
  }
}
