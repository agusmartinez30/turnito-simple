import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ComplexId } from '../../common/decorators/complex-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ComplexResponse,
  toComplexResponse,
} from '../../shared/serializers/complex.serializer';
import { ComplexService } from './complex.service';

@ApiTags('complex')
@ApiBearerAuth()
@Controller('complex')
export class ComplexController {
  constructor(private readonly complex: ComplexService) {}

  /** El complejo del admin autenticado (lo usa el panel). Los jugadores usan /public/c/:slug/complex. */
  @Get()
  @Roles(UserRole.ADMIN)
  async get(@ComplexId() complexId: string): Promise<ComplexResponse> {
    return toComplexResponse(await this.complex.findByIdOrThrow(complexId));
  }
}
