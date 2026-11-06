import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Multipart text fields arrive as strings: digit-only strings become numbers, the rest fails IsInt. */
const toInt = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (text === '') return undefined;
  return /^-?\d+$/.test(text) ? Number(text) : value;
};

/** Text fields of `POST public/c/:slug/bookings/:id/payment-proof` (the PDF travels as `file`). */
export class CreatePaymentProofDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Juan Pérez' })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'Indicá tu nombre' })
  @MaxLength(100, { message: 'El nombre no puede superar 100 caracteres' })
  payerName!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 2 })
  @Transform(toInt)
  @IsOptional()
  @IsInt({ message: 'La cantidad de jugadores debe ser un número entero' })
  @Min(1, { message: 'La cantidad de jugadores debe ser al menos 1' })
  @Max(50, { message: 'La cantidad de jugadores no puede superar 50' })
  playersCount?: number;

  @ApiProperty({
    minimum: 1,
    example: 5000,
    description:
      'Pesos que respalda el comprobante; no puede superar el saldo restante',
  })
  @Transform(toInt)
  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  amount!: number;
}
