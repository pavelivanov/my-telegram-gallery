import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorage } from '../storage/storage.types';
import { HealthService } from './health.service';

function createService() {
  const queryRawUnsafe = jest
    .fn()
    .mockResolvedValue([{ staleReservations: 0 }]);
  const checkStorageReady = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;
  const storage = {
    checkReady: checkStorageReady,
  } as unknown as ObjectStorage;
  const service = new HealthService(
    prisma,
    storage,
    new ConfigService({ READINESS_TIMEOUT_MS: 100 }),
  );
  return { checkStorageReady, queryRawUnsafe, service };
}

describe('HealthService', () => {
  it('reports ready only after database and storage checks succeed', async () => {
    const { checkStorageReady, queryRawUnsafe, service } = createService();

    await expect(service.checkReady()).resolves.toEqual({
      staleUploadReservations: 0,
    });
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('reservationReleasedAt'),
    );
    expect(checkStorageReady).toHaveBeenCalledTimes(1);
  });

  it('rejects when the database check fails', async () => {
    const { queryRawUnsafe, service } = createService();
    queryRawUnsafe.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.checkReady()).rejects.toThrow('database unavailable');
  });

  it('rejects when the storage check fails', async () => {
    const { checkStorageReady, service } = createService();
    checkStorageReady.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(service.checkReady()).rejects.toThrow('storage unavailable');
  });

  it('bounds checks that do not settle', async () => {
    const { checkStorageReady, service } = createService();
    checkStorageReady.mockReturnValueOnce(new Promise(() => {}));

    await expect(service.checkReady()).rejects.toThrow('timed out');
  });
});
