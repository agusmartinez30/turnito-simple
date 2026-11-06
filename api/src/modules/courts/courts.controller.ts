import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import {
  CourtResponse,
  toCourtResponse,
} from '../../shared/serializers/court.serializer';
import {
  AvailabilityResponse,
  AvailabilityService,
} from './availability.service';
import { CourtsService } from './courts.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { ListCourtsDto } from './dto/list-courts.dto';

@ApiTags('courts')
@ApiBearerAuth()
@Controller('courts')
export class CourtsController {
  constructor(
    private readonly courts: CourtsService,
    private readonly availability: AvailabilityService,
  ) {}

  /** El complejo viene en `?complexId=`; un admin puede omitirlo y ver el suyo (docs/15-multi-complex.md). */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCourtsDto,
  ): Promise<CourtResponse[]> {
    const complexId = query.complexId ?? user.complexId;
    if (!complexId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Revisá los datos ingresados.',
        { complexId: ['Indicá el complejo'] },
      );
    }
    const courts = await this.courts.list(complexId, query);
    return courts.map(toCourtResponse);
  }

  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<CourtResponse> {
    return toCourtResponse(await this.courts.findActiveOrThrow(id));
  }

  @Get(':id/availability')
  getAvailability(
    @Param('id', uuidParam('id')) id: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilityResponse> {
    return this.availability.getAvailability(id, query.date);
  }
}
