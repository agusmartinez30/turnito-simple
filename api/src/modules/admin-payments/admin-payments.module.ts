import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { StorageModule } from '../storage/storage.module';
import { AdminPaymentProofsController } from './admin-payment-proofs.controller';
import { AdminPaymentProofsService } from './admin-payment-proofs.service';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';

@Module({
  imports: [ComplexModule, StorageModule],
  controllers: [AdminPaymentsController, AdminPaymentProofsController],
  providers: [AdminPaymentsService, AdminPaymentProofsService],
})
export class AdminPaymentsModule {}
