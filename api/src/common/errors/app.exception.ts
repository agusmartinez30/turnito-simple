import { HttpStatus } from '@nestjs/common';
import { ERROR_HTTP_STATUS, ErrorCode, ErrorDetails } from './error-codes';

/**
 * Única excepción de negocio. El status HTTP se deriva del código, nunca se elige a mano.
 * Los `message` van en español: la web los muestra tal cual.
 */
export class AppException extends Error {
  readonly httpStatus: HttpStatus;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'AppException';
    this.httpStatus = ERROR_HTTP_STATUS[code];
  }
}
