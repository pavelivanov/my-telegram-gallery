import { Global, Module } from '@nestjs/common';
import { TelegramApiService } from './telegram-api.service';

@Global()
@Module({
  providers: [TelegramApiService],
  exports: [TelegramApiService],
})
export class TelegramModule {}
