import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { map, Observable } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';

/** Envuelve toda respuesta exitosa en `{ data: T }`. 204 y @SkipEnvelope() quedan crudos. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (res.statusCode === 204) return undefined;
        return { data: body ?? null };
      }),
    );
  }
}
