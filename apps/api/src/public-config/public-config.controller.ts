import { Controller, Get, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PublicConfigService } from './public-config.service';

@Controller('config')
@UseGuards(ThrottlerGuard)
export class PublicConfigController {
  constructor(private readonly publicConfig: PublicConfigService) {}

  @Get('public')
  getPublicConfig() {
    return this.publicConfig.getConfig();
  }
}
