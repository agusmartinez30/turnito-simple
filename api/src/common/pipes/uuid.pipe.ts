import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * ParseUUIDPipe cuyo error entra al envelope como VALIDATION_ERROR con `details.{param}`,
 * igual que los errores de DTO. Uso: `@Param('id', uuidParam('id')) id: string`.
 */
export function uuidParam(param = 'id'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      new BadRequestException({
        details: { [param]: ['Debe ser un UUID válido'] },
      }),
  });
}
