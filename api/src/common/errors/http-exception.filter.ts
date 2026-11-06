import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from './app.exception';
import {
  ERROR_HTTP_STATUS,
  ErrorCode,
  ErrorDetails,
  ErrorEnvelope,
} from './error-codes';

const GENERIC_MESSAGE = 'Ocurrió un error inesperado.';
export const UNAUTHORIZED_MESSAGE = 'Tu sesión expiró. Volvé a ingresar.';

/** Traduce cualquier excepción al envelope `{ error: { code, message, details? } }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, body } = this.translate(exception);

    if (status >= 500) {
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${req.method} ${req.originalUrl} → ${status}`, stack);
    }

    res.status(status).json(body);
  }

  private translate(exception: unknown): {
    status: number;
    body: ErrorEnvelope;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.httpStatus,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details ? { details: exception.details } : {}),
          },
        },
      };
    }

    if (exception instanceof BadRequestException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Revisá los datos ingresados.',
            details: extractValidationDetails(exception),
          },
        },
      };
    }

    if (exception instanceof UnauthorizedException) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        body: {
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: UNAUTHORIZED_MESSAGE,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      // 404 de ruta inexistente, 405, etc. Se mapean por status a un código conocido.
      const code = codeForStatus(exception.getStatus());
      return {
        status: ERROR_HTTP_STATUS[code],
        body: { error: { code, message: humanMessage(code) } },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: ErrorCode.INTERNAL_ERROR, message: GENERIC_MESSAGE },
      },
    };
  }
}

/**
 * El ValidationPipe global usa un `exceptionFactory` (ver validation.pipe.ts) que guarda los
 * detalles por campo en `response.details`. Un BadRequest de otro origen no trae details.
 */
function extractValidationDetails(
  exception: BadRequestException,
): ErrorDetails {
  const response = exception.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'details' in response
  ) {
    return (response as { details: ErrorDetails }).details;
  }
  return {};
}

const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED, // ThrottlerException
  // FileInterceptor: `transformException` de @nestjs/platform-express convierte el MulterError
  // de `limits.fileSize` en PayloadTooLargeException. Sin esta entrada sería un INTERNAL_ERROR
  // con el mensaje genérico (docs/18-storage.md).
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.FILE_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_FILE_TYPE,
};

function codeForStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR;
}

function humanMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.NOT_FOUND:
      return 'Recurso no encontrado.';
    case ErrorCode.FORBIDDEN:
      return 'No tenés permiso para hacer esto.';
    case ErrorCode.UNAUTHORIZED:
      return UNAUTHORIZED_MESSAGE;
    case ErrorCode.VALIDATION_ERROR:
      return 'Revisá los datos ingresados.';
    case ErrorCode.RATE_LIMITED:
      return 'Demasiados intentos. Esperá un minuto y volvé a probar.';
    case ErrorCode.FILE_TOO_LARGE:
      return 'El archivo es muy grande.';
    case ErrorCode.UNSUPPORTED_FILE_TYPE:
      return 'El formato del archivo no está permitido.';
    default:
      return GENERIC_MESSAGE;
  }
}
