import { Global, Module } from '@nestjs/common';
import { TenantBotCryptoService } from './tenant-bot-crypto.service';
import { TenantBotsController } from './tenant-bots.controller';
import { TenantBotsService } from './tenant-bots.service';

@Global()
@Module({
  controllers: [TenantBotsController],
  providers: [TenantBotCryptoService, TenantBotsService],
  exports: [TenantBotCryptoService, TenantBotsService],
})
export class TenantBotsModule {}
