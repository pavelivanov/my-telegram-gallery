import { Global, Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Global()
@Module({
  providers: [ThrottlerGuard],
  exports: [ThrottlerGuard],
})
export class RateLimitModule {}
