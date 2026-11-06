import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const CUSTOMER_STATUSES = ['active', 'archived', 'all'] as const;
export type CustomerStatusFilter = (typeof CUSTOMER_STATUSES)[number];

export class ListCustomersDto {
  @ApiPropertyOptional({
    minLength: 2,
    description: 'Nombre, apellido o teléfono',
  })
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'q debe ser texto' })
  @MinLength(2, { message: 'La búsqueda debe tener al menos 2 caracteres' })
  q?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES, { message: 'status inválido' })
  status: CustomerStatusFilter = 'active';

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(200, { message: 'limit no puede superar 200' })
  limit: number = 100;
}
