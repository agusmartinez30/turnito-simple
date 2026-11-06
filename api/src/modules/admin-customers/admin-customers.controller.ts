import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ComplexId } from '../../common/decorators/complex-id.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import {
  AdminBookingResponse,
  toAdminBookingResponse,
} from '../../shared/serializers/booking.serializer';
import {
  AdminCustomerResponse,
  CustomerStatsResponse,
  toAdminCustomerResponse,
} from '../../shared/serializers/customer.serializer';
import { ComplexService } from '../complex/complex.service';
import {
  AdminCustomersService,
  CustomerWithAggregates,
} from './admin-customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** Ficha completa: el cliente, sus totales y su historial (docs/17-admin-customers.md). */
export interface AdminCustomerDetailResponse extends AdminCustomerResponse {
  stats: CustomerStatsResponse;
  bookings: AdminBookingResponse[];
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(
    private readonly customers: AdminCustomersService,
    private readonly complex: ComplexService,
  ) {}

  @Get()
  async list(
    @ComplexId() complexId: string,
    @Query() query: ListCustomersDto,
  ): Promise<AdminCustomerResponse[]> {
    const [rows, timezone] = await Promise.all([
      this.customers.list(complexId, query),
      this.timezone(complexId),
    ]);
    return rows.map((row) => this.serialize(row, timezone));
  }

  @Get(':id')
  async get(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<AdminCustomerDetailResponse> {
    const [detail, timezone] = await Promise.all([
      this.customers.detail(complexId, id),
      this.timezone(complexId),
    ]);
    return {
      ...this.serialize(detail, timezone),
      stats: detail.stats,
      bookings: detail.bookings.map((b) => toAdminBookingResponse(b, timezone)),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateCustomerDto,
  ): Promise<AdminCustomerResponse> {
    return this.serialize(
      await this.customers.create(complexId, admin.id, dto),
      await this.timezone(complexId),
    );
  }

  @Patch(':id')
  async update(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<AdminCustomerResponse> {
    return this.serialize(
      await this.customers.update(complexId, id, dto),
      await this.timezone(complexId),
    );
  }

  private serialize(
    { customer, aggregates }: CustomerWithAggregates,
    timezone: string,
  ): AdminCustomerResponse {
    return toAdminCustomerResponse(customer, aggregates, timezone);
  }

  private async timezone(complexId: string): Promise<string> {
    return (await this.complex.findByIdOrThrow(complexId)).timezone;
  }
}
