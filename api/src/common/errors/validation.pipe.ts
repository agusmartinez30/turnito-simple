import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ErrorDetails } from './error-codes';

/** Aplana los ValidationError anidados de class-validator a `{ campo: ['msg', ...] }`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ErrorDetails {
  const details: ErrorDetails = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      details[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(details, flattenValidationErrors(error.children, path));
    }
  }
  return details;
}

/** ValidationPipe global con la configuración del MVP (docs/00-overview.md). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new BadRequestException({ details: flattenValidationErrors(errors) }),
  });
}
