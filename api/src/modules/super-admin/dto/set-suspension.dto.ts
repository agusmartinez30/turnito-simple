import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetSuspensionDto {
  @ApiProperty({
    description: 'true suspends the complex, false reactivates it',
  })
  @IsBoolean({ message: 'suspended debe ser true o false' })
  suspended!: boolean;
}
