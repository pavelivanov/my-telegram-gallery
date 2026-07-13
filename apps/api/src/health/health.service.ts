import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.types';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly config: ConfigService,
  ) {}

  async checkReady(): Promise<{ staleUploadReservations: number }> {
    const timeoutMs = this.config.getOrThrow<number>('READINESS_TIMEOUT_MS');
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Readiness check timed out')),
        timeoutMs,
      );
    });

    try {
      const [rows] = await Promise.race([
        Promise.all([
          this.prisma.$queryRawUnsafe<Array<{ staleReservations: number }>>(
            `SELECT COUNT(*)::INTEGER AS "staleReservations"
             FROM "UploadIntent"
             WHERE "reservationReleasedAt" IS NULL
               AND "expiresAt" <= CURRENT_TIMESTAMP
               AND "status" IN ('PENDING', 'UPLOADED', 'FAILED')`,
          ),
          this.storage.checkReady(),
        ]),
        timeout,
      ]);
      return { staleUploadReservations: rows[0]?.staleReservations ?? 0 };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
