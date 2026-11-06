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
} from '../../shared/serializers/booking.serializer';
import {
  PaymentLedgerResponse,
  toPaymentLedgerRowResponse,
  toPaymentProofLedgerRowResponse,
} from '../../shared/serializers/payment-ledger.serializer';
import { ComplexService } from '../complex/complex.service';
import { AdminPaymentsService } from './admin-payments.service';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';

/** Ambas mutaciones devuelven el detalle de la reserva con `payment` y `payments[]` frescos. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly payments: AdminPaymentsService,
    private readonly complex: ComplexService,
  ) {}

  /** Caja: pagos de un día o rango con totales por método, más los comprobantes (`proofs`). */
  @Get('payments')
  async list(
    @ComplexId() complexId: string,
    @Query() query: ListPaymentsDto,
  ): Promise<PaymentLedgerResponse> {
    const [ledger, timezone] = await Promise.all([
      this.payments.list(complexId, query),
      this.timezone(complexId),
    ]);
    return {
      range: ledger.range,
      totals: ledger.totals,
      payments: ledger.payments.map((p) =>
        toPaymentLedgerRowResponse(p, timezone),
      ),
      proofs: ledger.proofs.map((p) =>
        toPaymentProofLedgerRowResponse(p, timezone),
      ),
    };
  }

  @Post('bookings/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
    @Body() dto: RegisterPaymentDto,
  ): Promise<AdminBookingResponse> {
    const booking = await this.payments.register(complexId, admin.id, id, dto);
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  @Patch('bookings/:id/payments/:paymentId/void')
  @HttpCode(HttpStatus.OK)
  async void(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
    @Param('paymentId', uuidParam('paymentId')) paymentId: string,
    @Body() dto: VoidPaymentDto,
  ): Promise<AdminBookingResponse> {
    const booking = await this.payments.void(
      complexId,
      admin.id,
      id,
      paymentId,
      dto.reason,
    );
    return toAdminBookingDetailResponse(
      booking,
      await this.timezone(complexId),
    );
  }

  private async timezone(complexId: string): Promise<string> {
    return (await this.complex.findByIdOrThrow(complexId)).timezone;
  }
}
