import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TgUser } from '../auth/tg-init-data.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertTenantReadable,
  type TenantContext,
} from '../tenants/tenant-context';
import type { CreateReportDto } from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(context: TenantContext, reporter: TgUser, dto: CreateReportDto) {
    assertTenantReadable(context);
    if (dto.albumId) {
      const album = await this.prisma.album.findFirst({
        where: { id: dto.albumId, tenantId: context.id },
        select: { id: true },
      });
      if (!album) throw new NotFoundException('Report target not found');
    }
    if (dto.photoId) {
      const photo = await this.prisma.photo.findFirst({
        where: {
          id: dto.photoId,
          tenantId: context.id,
          ...(dto.albumId ? { albumId: dto.albumId } : {}),
        },
        select: { id: true },
      });
      if (!photo) throw new NotFoundException('Report target not found');
    }

    try {
      const report = await this.prisma.report.create({
        data: {
          tenantId: context.id,
          reporterTgUserId: BigInt(reporter.id),
          albumId: dto.albumId,
          photoId: dto.photoId,
          reason: dto.reason,
          detail: dto.detail?.trim() || null,
        },
      });
      return {
        id: report.id,
        status: report.status.toLowerCase(),
        createdAt: report.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'REPORT_ALREADY_OPEN',
          message: 'You already have an open report for this content.',
        });
      }
      throw error;
    }
  }
}
