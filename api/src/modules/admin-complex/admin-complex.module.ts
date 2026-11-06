import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { StorageModule } from '../storage/storage.module';
import { AdminComplexController } from './admin-complex.controller';
import { ComplexLogoService } from './complex-logo.service';

@Module({
  imports: [ComplexModule, StorageModule],
  controllers: [AdminComplexController],
  providers: [ComplexLogoService],
})
export class AdminComplexModule {}
