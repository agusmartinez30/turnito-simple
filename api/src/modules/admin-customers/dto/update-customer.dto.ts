import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { normalizePhone } from '../../../shared/customers/phone';
import { CreateCustomerDto } from './create-customer.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;
const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== ''
    ? normalizePhone(value)
    : value;

/**
 * Todos los campos opcionales; los que vienen se validan igual que en create.
 * `lastName`, `phone` y `note` aceptan `null` para borrar el valor ('' se trata como null).
 * `isActive: false` archiva y `true` restaura, igual que en canchas.
 */
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['lastName', 'phone', 'note'] as const),
) {
  @ApiPropertyOptional({ minLength: 2, maxLength: 60, nullable: true })
  @Transform(trim)
  @Transform(emptyToNull)
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString({ message: 'El apellido debe ser texto' })
  @Length(2, 60, { message: 'El apellido debe tener entre 2 y 60 caracteres' })
  lastName?: string | null;

  @ApiPropertyOptional({ example: '+5491100000077', nullable: true })
  @Transform(phone)
  @Transform(emptyToNull)
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\+\d{8,15}$/, {
    message: 'El teléfono debe tener entre 8 y 15 dígitos',
  })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 280, nullable: true })
  @Transform(trim)
  @Transform(emptyToNull)
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString({ message: 'La nota debe ser texto' })
  @MaxLength(280, { message: 'La nota no puede superar 280 caracteres' })
  note?: string | null;

  @ApiPropertyOptional({ description: 'false = archivado' })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}
