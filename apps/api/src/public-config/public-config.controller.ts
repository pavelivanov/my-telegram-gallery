import { Controller, Get } from '@nestjs/common';
import { PublicConfigService } from './public-config.service';

@Controller('config')
export class PublicConfigController {
  constructor(private readonly publicConfig: PublicConfigService) {}

  @Get('public')
  getPublicConfig() {
    return this.publicConfig.getConfig();
  }
}
