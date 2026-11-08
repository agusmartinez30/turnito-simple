import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import { ListSuperAdminComplexesDto } from './dto/list-super-admin-complexes.dto';
import { SetSuspensionDto } from './dto/set-suspension.dto';
import {
  SuperAdminComplexResponse,
  SuperAdminRevenueResponse,
  SuperAdminService,
} from './super-admin.service';

/** Platform panel (docs/26-super-admin.md). Only SUPER_ADMIN; ADMINs get 403 FORBIDDEN. */
@ApiTags('super-admin')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('super-admin/complexes')
export class SuperAdminController {
  constructor(private readonly superAdmin: SuperAdminService) {}

  @Get()
  list(
    @Query() query: ListSuperAdminComplexesDto,
  ): Promise<SuperAdminComplexResponse[]> {
    return this.superAdmin.listComplexes(query.month);
  }

  @Get(':id/revenue')
  revenue(
    @Param('id', uuidParam('id')) id: string,
    @Query() query: ListSuperAdminComplexesDto,
  ): Promise<SuperAdminRevenueResponse> {
    return this.superAdmin.revenueFor(id, query.month);
  }

  @Patch(':id/suspension')
  setSuspension(
    @Param('id', uuidParam('id')) id: string,
    @Body() dto: SetSuspensionDto,
  ): Promise<SuperAdminComplexResponse> {
    return this.superAdmin.setSuspension(id, dto.suspended);
  }
}
