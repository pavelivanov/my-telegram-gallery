import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PhotosService } from './photos/photos.service';

async function cleanupUploads(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(PhotosService).cleanupExpiredUploads();
    console.info(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void cleanupUploads().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
