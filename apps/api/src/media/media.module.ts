import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaUrlSigner } from './media-url.signer';

@Module({
  imports: [StorageModule],
  controllers: [MediaController],
  providers: [MediaService, MediaUrlSigner],
  exports: [MediaService, MediaUrlSigner],
})
export class MediaModule {}
