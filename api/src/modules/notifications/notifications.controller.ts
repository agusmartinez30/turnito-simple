import {
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
import { Roles } from '../../common/decorators/roles.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import {
  NotificationResponse,
  NotificationsService,
} from './notifications.service';

/** Admin notification center (proofs submitted from the public payment link). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@ComplexId() complexId: string): Promise<NotificationResponse[]> {
    return this.notifications.list(complexId);
  }

  @Get('unread-count')
  unreadCount(@ComplexId() complexId: string): Promise<{ count: number }> {
    return this.notifications.unreadCount(complexId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@ComplexId() complexId: string): Promise<{ updated: number }> {
    return this.notifications.markAllRead(complexId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(
    @ComplexId() complexId: string,
    @Param('id', uuidParam('id')) id: string,
  ): Promise<NotificationResponse> {
    return this.notifications.markRead(complexId, id);
  }
}
