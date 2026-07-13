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

  async checkReady(): Promise<void> {
    const timeoutMs = this.config.getOrThrow<number>('READINESS_TIMEOUT_MS');
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Readiness check timed out')),
        timeoutMs,
      );
    });

    try {
      await Promise.race([
        Promise.all([
          this.prisma.$queryRawUnsafe('SELECT 1'),
          this.storage.checkReady(),
        ]),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
