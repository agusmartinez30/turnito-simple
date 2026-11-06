import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimezone } from '../../../shared/time/tz';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

@ValidatorConstraint({ name: 'ianaTimezone' })
class IanaTimezone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTimezone(value);
  }
}

/**
 * Alta de un complejo con su primer administrador (docs/15-multi-complex.md).
 * Plano a propósito: los `details` de validación quedan por campo simple y la web los mapea 1:1.
 */
export class RegisterComplexDto {
  @ApiProperty({ example: 'Club Río', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString({ message: 'El nombre del complejo debe ser texto' })
  @Length(2, 80, {
    message: 'El nombre del complejo debe tener entre 2 y 80 caracteres',
  })
  complexName!: string;

  @ApiProperty({
    example: 'Av. Costanera 1500, Rosario',
    minLength: 2,
    maxLength: 160,
  })
  @Transform(trim)
  @IsString({ message: 'La dirección debe ser texto' })
  @Length(2, 160, {
    message: 'La dirección debe tener entre 2 y 160 caracteres',
  })
  complexAddress!: string;

  @ApiProperty({ example: 'America/Argentina/Buenos_Aires' })
  @Validate(IanaTimezone, { message: 'La zona horaria no es válida' })
  timezone!: string;

  @ApiProperty({ example: 'Carla Dueña', minLength: 2, maxLength: 60 })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @Length(2, 60, { message: 'El nombre debe tener entre 2 y 60 caracteres' })
  name!: string;

  @ApiProperty({ example: 'carla@clubrio.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'El email no es válido' })
  email!: string;

  @ApiPropertyOptional({
    example: '+5491100000001',
    pattern: '^\\+?\\d{8,15}$',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(/^\+?\d{8,15}$/, {
    message: 'El teléfono debe tener entre 8 y 15 dígitos',
  })
  phone?: string;

  @ApiProperty({ example: 'password123', minLength: 8, maxLength: 72 })
  @IsString({ message: 'La contraseña debe ser texto' })
  @Length(8, 72, {
    message: 'La contraseña debe tener entre 8 y 72 caracteres',
  })
  password!: string;
}
