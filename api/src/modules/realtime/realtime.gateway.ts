import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import type { Namespace, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import {
  complexRoom,
  PAYMENT_CHANGED_EVENT,
  PaymentChangedPayload,
  REALTIME_NAMESPACE,
} from './realtime.types';

const UNAUTHORIZED = 'unauthorized';

interface SocketData {
  complexId?: string;
}

/**
 * Admin push channel. Same JWT as the REST API (HS256, `Authorization: Bearer` semantics), sent as
 * `handshake.auth.token` (or the Authorization header). Role and complex are read from the DB, like
 * RolesGuard, so a demoted admin cannot connect. Each socket joins `complex:<id>` only.
 */
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: {
    // Evaluated per handshake so it follows the same WEB_ORIGIN the HTTP CORS uses.
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => cb(null, !origin || origin === process.env.WEB_ORIGIN),
    credentials: false,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error(UNAUTHORIZED)));
    });
  }

  handleConnection(client: Socket): void {
    const { complexId } = client.data as SocketData;
    if (!complexId) {
      client.disconnect(true);
      return;
    }
    void client.join(complexRoom(complexId));
  }

  /** Delivers the payload to the admins of its complex only. */
  emitPaymentChanged(payload: PaymentChangedPayload): void {
    this.server
      .to(complexRoom(payload.complexId))
      .emit(PAYMENT_CHANGED_EVENT, payload);
  }

  /** Verifies the token and admin role; stores the complex on the socket or throws. */
  private async authenticate(socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) throw new Error(UNAUTHORIZED);

    const payload = await this.jwt.verifyAsync<{ sub?: string }>(token, {
      algorithms: ['HS256'],
    });
    if (!payload.sub) throw new Error(UNAUTHORIZED);

    const user = await this.users.findById(payload.sub);
    if (!user || user.role !== UserRole.ADMIN || !user.complexId) {
      this.logger.debug('Socket rejected: not an admin of a complex');
      throw new Error(UNAUTHORIZED);
    }
    (socket.data as SocketData).complexId = user.complexId;
  }

  private extractToken(socket: Socket): string | null {
    const fromAuth = (socket.handshake.auth as { token?: unknown } | undefined)
      ?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;

    const header = socket.handshake.headers.authorization;
    const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
    return match?.[1] ?? null;
  }
}
