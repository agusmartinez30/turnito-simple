import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizePhone } from '../../../shared/customers/phone';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;
const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== ''
    ? normalizePhone(value)
    : value;

/**
 * Alta desde el panel (docs/17-admin-customers.md). Solo el nombre es obligatorio: exigirle
 * apellido y teléfono al mostrador para cargar un turno genera datos basura. La app pública
 * sí pide los tres (`CreatePublicRequestDto`).
 */
export class CreateCustomerDto {
  @ApiProperty({ example: 'Carlos', minLength: 2, maxLength: 60 })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @Length(2, 60, { message: 'El nombre debe tener entre 2 y 60 caracteres' })
  firstName!: string;

  @ApiPropertyOptional({ example: 'Pérez', minLength: 2, maxLength: 60 })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'El apellido debe ser texto' })
  @Length(2, 60, { message: 'El apellido debe tener entre 2 y 60 caracteres' })
  lastName?: string;

  @ApiPropertyOptional({
    example: '+5491100000077',
    description: "Se canoniza a '+' + dígitos; es la identidad del cliente",
  })
  @Transform(phone)
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^\+\d{8,15}$/, {
    message: 'El teléfono debe tener entre 8 y 15 dígitos',
  })
  phone?: string;

  @ApiPropertyOptional({ maxLength: 280 })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto' })
  @MaxLength(280, { message: 'La nota no puede superar 280 caracteres' })
  note?: string;
}
