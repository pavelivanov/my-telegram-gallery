import { Global, Module } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantContextService } from './tenant-context.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Global()
@Module({
  controllers: [TenantsController],
  providers: [TenantContextGuard, TenantContextService, TenantsService],
  exports: [TenantContextGuard, TenantContextService, TenantsService],
})
export class TenantsModule {}
