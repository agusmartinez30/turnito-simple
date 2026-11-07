import { Module } from '@nestjs/common';
import { ComplexModule } from '../complex/complex.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Admin notification center: persisted notifications scoped per complex (docs/25-notifications.md). */
@Module({
  imports: [ComplexModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
