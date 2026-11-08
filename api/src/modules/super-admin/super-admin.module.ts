import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [ComplexModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminBootstrapService],
})
export class SuperAdminModule {}
