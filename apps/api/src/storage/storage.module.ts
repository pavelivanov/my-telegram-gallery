import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesystemStorage } from './filesystem.storage';
import { R2Service } from './r2.service';
import { S3Storage } from './s3.storage';
import { OBJECT_STORAGE, type ObjectStorage } from './storage.types';

@Global()
@Module({
  providers: [
    R2Service,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory(config: ConfigService): ObjectStorage {
        return config.getOrThrow<string>('STORAGE_DRIVER') === 'filesystem'
          ? new FilesystemStorage(
              config.getOrThrow<string>('FILESYSTEM_STORAGE_PATH'),
            )
          : new S3Storage(config);
      },
    },
  ],
  exports: [OBJECT_STORAGE, R2Service],
})
export class StorageModule {}
