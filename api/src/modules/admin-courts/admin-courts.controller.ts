import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ComplexId } from '../../common/decorators/complex-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import {
  AdminCourtResponse,
  toAdminCourtResponse,
} from '../../shared/serializers/court.serializer';
import { ComplexService } from '../complex/complex.service';
import {
  AdminCourtsService,
  CourtWithFutureCount,
} from './admin-courts.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/courts')
export class AdminCourtsController {
  constructor(
    private readonly courts: AdminCourtsService,
    private readonly complex: ComplexService,
  ) {}

  @Get()
  async list(@ComplexId() complexId: string): Promise<AdminCourtResponse[]> {
    const [courts, timezone] = await Promise.all([
      this.courts.list(complexId),
      this.timezone(complexId),
    ]);
    return courts.map((c) => this.serialize(c, timezone));
  }

  @Get(':id')
  async get(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<AdminCourtResponse> {
    return this.serialize(
      await this.courts.findOrThrow(complexId, id),
      await this.timezone(complexId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ComplexId() complexId: string,
    @Body() dto: CreateCourtDto,
  ): Promise<AdminCourtResponse> {
    return this.serialize(
      await this.courts.create(complexId, dto),
      await this.timezone(complexId),
    );
  }

  @Patch(':id')
  async update(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
    @Body() dto: UpdateCourtDto,
  ): Promise<AdminCourtResponse> {
    return this.serialize(
      await this.courts.update(complexId, id, dto),
      await this.timezone(complexId),
    );
  }

  private serialize(
    { court, futureBookingsCount }: CourtWithFutureCount,
    timezone: string,
  ): AdminCourtResponse {
    return toAdminCourtResponse(court, futureBookingsCount, timezone);
  }

  private async timezone(complexId: string): Promise<string> {
    return (await this.complex.findByIdOrThrow(complexId)).timezone;
  }
}
