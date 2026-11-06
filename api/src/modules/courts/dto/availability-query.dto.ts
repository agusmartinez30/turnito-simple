import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({
    example: '2026-09-13',
    description: 'Día local del complejo, YYYY-MM-DD',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener formato YYYY-MM-DD',
  })
  date!: string;
}
