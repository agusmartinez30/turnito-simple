import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageModule } from '../storage/storage.module';
import { PublicBookingsController } from './public-bookings.controller';
import { PublicBookingsService } from './public-bookings.service';
import { PublicComplexController } from './public-complex.controller';
import { PublicPaymentController } from './public-payment.controller';
import { PublicPaymentService } from './public-payment.service';

@Module({
  imports: [ComplexModule, StorageModule, RealtimeModule],
  controllers: [
    PublicComplexController,
    PublicPaymentController,
    PublicBookingsController,
  ],
  providers: [PublicPaymentService, PublicBookingsService],
})
export class PublicModule {}
