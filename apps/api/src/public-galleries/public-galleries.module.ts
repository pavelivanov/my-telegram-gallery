import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ReportsModule } from '../reports/reports.module';
import { PublicGalleriesController } from './public-galleries.controller';
import { PublicGalleriesService } from './public-galleries.service';

@Module({
  imports: [MediaModule, ReportsModule],
  controllers: [PublicGalleriesController],
  providers: [PublicGalleriesService],
})
export class PublicGalleriesModule {}
