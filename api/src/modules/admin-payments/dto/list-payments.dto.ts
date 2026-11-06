import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { booleanString } from '../../../common/transforms/boolean-string';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'La fecha debe tener formato YYYY-MM-DD';

/** El rango aplica sobre `createdAt` del pago (cuándo se registró), en días locales del complejo. */
export class ListPaymentsDto {
  @ApiPropertyOptional({
    example: '2026-09-13',
    description: 'Día local del complejo. Anula from/to. Sin fechas → hoy.',
  })
  @IsOptional()
  @Matches(LOCAL_DATE, { message: DATE_MESSAGE })
  date?: string;

  @ApiPropertyOptional({
    example: '2026-09-08',
    description: 'Día local, inclusive',
  })
  @IsOptional()
  @Matches(LOCAL_DATE, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-14',
    description: 'Día local, inclusive',
  })
  @IsOptional()
  @Matches(LOCAL_DATE, { message: DATE_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  method?: PaymentMethod;

  @ApiPropertyOptional({
    minLength: 2,
    description: 'Busca en nombre / email / teléfono del cliente del turno',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'La búsqueda debe tener al menos 2 caracteres' })
  q?: string;

  @ApiPropertyOptional({
    description:
      'true → incluye pagos anulados en el listado (nunca en los totales)',
  })
  @Transform(booleanString)
  @IsOptional()
  @IsBoolean({ message: "voided debe ser 'true' o 'false'" })
  voided?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(200, { message: 'limit no puede superar 200' })
  limit: number = 100;
}
