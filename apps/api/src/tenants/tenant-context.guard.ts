import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { TgRequest } from '../auth/request-context';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly tenants: TenantContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TgRequest>();
    request.tenantContext = await this.tenants.resolve(request);
    return true;
  }
}
