import { BadRequestException, ParseEnumPipe } from '@nestjs/common';
import { Sport } from '@prisma/client';

/**
 * ParseEnumPipe(Sport) con el error en el envelope como VALIDATION_ERROR `details.sport`.
 * Uso: `@Param('sport', sportParam()) sport: Sport`.
 */
export function sportParam(param = 'sport'): ParseEnumPipe<typeof Sport> {
  return new ParseEnumPipe(Sport, {
    exceptionFactory: () =>
      new BadRequestException({ details: { [param]: ['Deporte inválido'] } }),
  });
}
