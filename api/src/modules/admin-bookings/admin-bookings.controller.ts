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
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ComplexId } from '../../common/decorators/complex-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import {
  AdminBookingResponse,
  toAdminBookingDetailResponse,
  toAdminBookingResponse,
} from '../../shared/serializers/booking.serializer';
import { ComplexService } from '../complex/complex.service';
import { AdminBookingsService } from './admin-bookings.service';
import { CancelAdminBookingDto } from './dto/cancel-admin-booking.dto';
import { CreateAdminBookingDto } from './dto/create-admin-booking.dto';
import { ListAdminBookingsDto } from './dto/list-admin-bookings.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminBookingsController {
  constructor(
    private readonly bookings: AdminBookingsService,
    private readonly complex: ComplexService,
  ) {}

  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateAdminBookingDto,
  ): Promise<AdminBookingResponse> {
    const booking = await this.bookings.create(complexId, admin.id, dto);
    return toAdminBookingResponse(booking, await this.timezone(complexId));
  }

  @Get('bookings')
  async list(
    @ComplexId() complexId: string,
    @Query() query: ListAdminBookingsDto,
  ): Promise<AdminBookingResponse[]> {
    const [bookings, timezone] = await Promise.all([
      this.bookings.list(complexId, query),
      this.timezone(complexId),
    ]);
    return bookings.map((b) => toAdminBookingResponse(b, timezone));
  }

  @Get('bookings/:id')
  async get(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<AdminBookingResponse> {
    const booking = await this.bookings.findOrThrow(complexId, id);
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  @Patch('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
    @Body() dto: CancelAdminBookingDto,
  ): Promise<AdminBookingResponse> {
    const booking = await this.bookings.cancel(
      complexId,
      admin.id,
      id,
      dto.reason,
    );
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  @Patch('bookings/:id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<AdminBookingResponse> {
    const booking = await this.bookings.confirm(complexId, admin.id, id);
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  @Patch('bookings/:id/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<AdminBookingResponse> {
    const booking = await this.bookings.start(complexId, admin.id, id);
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  @Patch('bookings/:id/finish')
  @HttpCode(HttpStatus.OK)
  async finish(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<AdminBookingResponse> {
    const booking = await this.bookings.finish(complexId, admin.id, id);
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  private async timezone(complexId: string): Promise<string> {
    return (await this.complex.findByIdOrThrow(complexId)).timezone;
  }
}
