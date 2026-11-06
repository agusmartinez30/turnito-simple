import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** Sin tope: el sobrepago se permite (queda saldo a favor). */
export class RegisterPaymentDto {
  @ApiProperty({ example: 2000, minimum: 1, description: 'Entero, en pesos' })
  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  amount!: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  method!: PaymentMethod;

  @ApiPropertyOptional({ maxLength: 120, example: 'Juan, paga por dos' })
  @Transform(trim)
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto' })
  @MaxLength(120, { message: 'La nota no puede superar 120 caracteres' })
  note?: string;
}
