import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { SkipEnvelope } from '../decorators/skip-envelope.decorator';

/** Fuera del prefijo /api/v1 (ver app.setup.ts) y sin envelope. Lo usa Docker/orquestador. */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @SkipEnvelope()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
