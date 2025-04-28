import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { NcContext, NcRequest } from 'nocodb-sdk';
import { MetaApiLimiterGuard } from '~/guards/meta-api-limiter.guard';
import { GlobalGuard } from '~/guards/global/global.guard';
import { RealtimeService } from '~/meta/realtime.service';
import { TenantContext } from '~/decorators/tenant-context.decorator';

@Controller()
@UseGuards(MetaApiLimiterGuard, GlobalGuard)
export class RealtimeController {
  constructor(private realtimeService: RealtimeService) {}

  @Get('/api/v2/meta/:baseId/bootstrap')
  async bootstrap(@TenantContext() context: NcContext, @Req() req: NcRequest) {
    return this.realtimeService.bootstrap(context, req);
  }
}
