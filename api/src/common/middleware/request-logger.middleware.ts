import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthUser } from '../decorators/current-user.decorator';

/** Loguea método, path, status, duración y userId (si hay) al terminar cada request. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const userId = (req as Request & { user?: AuthUser }).user?.id;
      const suffix = userId ? ` user=${userId}` : '';
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms${suffix}`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });
    next();
  }
}
