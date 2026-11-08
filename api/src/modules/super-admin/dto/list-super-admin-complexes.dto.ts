import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ListSuperAdminComplexesDto {
  @ApiPropertyOptional({
    example: '2026-09',
    description:
      'Month of the stats (YYYY-MM, in each complex timezone). Defaults to the current month.',
  })
  @IsOptional()
  @Matches(MONTH_RE, { message: 'month debe tener el formato YYYY-MM' })
  month?: string;
}
