import { Module } from '@nestjs/common';
import { OpsService } from './ops.service';

@Module({
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
