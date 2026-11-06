import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class CreateAdminBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'courtId debe ser un UUID válido' })
  courtId!: string;

  @ApiProperty({
    example: '2026-09-13T17:00:00-03:00',
    description: 'ISO-8601 con offset',
  })
  @IsISO8601(
    { strict: true },
    { message: 'startsAt debe ser una fecha ISO-8601' },
  )
  startsAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Cliente del complejo, activo. Ausente = turno de mostrador sin cliente (docs/17-admin-customers.md)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUUID(undefined, { message: 'customerId debe ser un UUID válido' })
  customerId?: string;

  @ApiPropertyOptional({
    example: 8000,
    minimum: 0,
    description: 'Default: precio de lista de la cancha',
  })
  @IsOptional()
  @IsInt({ message: 'El precio debe ser un número entero' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price?: number;

  @ApiPropertyOptional({ maxLength: 280 })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto' })
  @MaxLength(280, { message: 'La nota no puede superar 280 caracteres' })
  note?: string;
}
