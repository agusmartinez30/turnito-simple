import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { StorageModule } from '../storage/storage.module';
import { PublicComplexController } from './public-complex.controller';
import { PublicPaymentController } from './public-payment.controller';
import { PublicPaymentService } from './public-payment.service';

@Module({
  imports: [ComplexModule, StorageModule],
  controllers: [PublicComplexController, PublicPaymentController],
  providers: [PublicPaymentService],
})
export class PublicModule {}
