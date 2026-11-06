import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ComplexId } from '../../common/decorators/complex-id.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import {
  AdminPaymentProofsService,
  PaymentProofResponse,
} from './admin-payment-proofs.service';
import {
  ApprovePaymentProofDto,
  RejectPaymentProofDto,
} from './dto/payment-proof-review.dto';

/** Review of the receipts uploaded from the public payment link. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/bookings/:id/payment-proofs')
export class AdminPaymentProofsController {
  constructor(private readonly proofs: AdminPaymentProofsService) {}

  @Get()
  list(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<PaymentProofResponse[]> {
    return this.proofs.list(complexId, id);
  }

  @Get(':proofId/file')
  file(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
    @Param('proofId', uuidParam('proofId')) proofId: string,
  ): Promise<{ url: string }> {
    return this.proofs.fileUrl(complexId, id, proofId);
  }

  @Post(':proofId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
    @Param('proofId', uuidParam('proofId')) proofId: string,
    @Body() dto: ApprovePaymentProofDto,
  ): Promise<PaymentProofResponse> {
    return this.proofs.approve(complexId, admin.id, id, proofId, dto.amount);
  }

  @Post(':proofId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @ComplexId() complexId: string,
    @CurrentUser() admin: AuthUser,
    @Param('id', uuidParam('id')) id: string,
    @Param('proofId', uuidParam('proofId')) proofId: string,
    @Body() dto: RejectPaymentProofDto,
  ): Promise<PaymentProofResponse> {
    return this.proofs.reject(complexId, admin.id, id, proofId, dto.reason);
  }
}
