import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { Namespace, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import { RealtimeGateway } from './realtime.gateway';

type Middleware = (
  socket: Socket,
  next: (err?: Error) => void,
) => void | Promise<void>;

const join = jest.fn();
const disconnect = jest.fn();

function fakeSocket(opts: { token?: unknown; authorization?: string }): Socket {
  return {
    data: {},
    handshake: {
      auth: opts.token === undefined ? {} : { token: opts.token },
      headers: { authorization: opts.authorization },
    },
    join,
    disconnect,
  } as unknown as Socket;
}

describe('RealtimeGateway', () => {
  const verifyAsync = jest.fn();
  const findById = jest.fn();
  let gateway: RealtimeGateway;
  let middleware: Middleware;

  const authenticate = (socket: Socket): Promise<Error | undefined> =>
    new Promise((resolve) => {
      void middleware(socket, (err) => resolve(err));
    });

  beforeEach(() => {
    join.mockReset();
    disconnect.mockReset();
    verifyAsync.mockReset();
    findById.mockReset();
    gateway = new RealtimeGateway(
      { verifyAsync } as unknown as JwtService,
      { findById } as unknown as UsersService,
    );
    gateway.afterInit({
      use: (fn: Middleware) => {
        middleware = fn;
      },
    } as unknown as Namespace);
  });

  describe('handshake authentication', () => {
    it('rejects a socket without token', async () => {
      expect((await authenticate(fakeSocket({})))?.message).toBe(
        'unauthorized',
      );
      expect(verifyAsync).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      verifyAsync.mockRejectedValue(new Error('jwt expired'));
      expect((await authenticate(fakeSocket({ token: 'bad' })))?.message).toBe(
        'unauthorized',
      );
    });

    it('rejects a user that is not an admin of a complex', async () => {
      verifyAsync.mockResolvedValue({ sub: 'u1' });
      findById.mockResolvedValue({
        id: 'u1',
        role: UserRole.PLAYER,
        complexId: null,
      });
      expect((await authenticate(fakeSocket({ token: 't' })))?.message).toBe(
        'unauthorized',
      );
    });

    it('accepts the token from handshake.auth and stores the DB complex', async () => {
      verifyAsync.mockResolvedValue({ sub: 'u1' });
      findById.mockResolvedValue({
        id: 'u1',
        role: UserRole.ADMIN,
        complexId: 'c1',
      });
      const socket = fakeSocket({ token: 't' });
      expect(await authenticate(socket)).toBeUndefined();
      expect(socket.data).toEqual({ complexId: 'c1' });
    });

    it('accepts a Bearer Authorization header as fallback', async () => {
      verifyAsync.mockResolvedValue({ sub: 'u1' });
      findById.mockResolvedValue({
        id: 'u1',
        role: UserRole.ADMIN,
        complexId: 'c1',
      });
      const socket = fakeSocket({ authorization: 'Bearer abc' });
      expect(await authenticate(socket)).toBeUndefined();
      expect(verifyAsync).toHaveBeenCalledWith('abc', {
        algorithms: ['HS256'],
      });
    });
  });

  describe('rooms', () => {
    it('joins the room of the socket complex', () => {
      const socket = fakeSocket({});
      socket.data = { complexId: 'c1' };
      gateway.handleConnection(socket);
      expect(join).toHaveBeenCalledWith('complex:c1');
    });

    it('disconnects a socket that never got a complex', () => {
      const socket = fakeSocket({});
      gateway.handleConnection(socket);
      expect(disconnect).toHaveBeenCalledWith(true);
      expect(join).not.toHaveBeenCalled();
    });

    it('emits payment.changed only to the complex room', () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      gateway.server = { to } as unknown as Namespace;
      const payload = {
        complexId: 'c1',
        bookingId: 'b1',
        kind: 'proof_approved' as const,
      };

      gateway.emitPaymentChanged(payload);

      expect(to).toHaveBeenCalledWith('complex:c1');
      expect(emit).toHaveBeenCalledWith('payment.changed', payload);
    });

    it('emits notification.created only to the complex room', () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      gateway.server = { to } as unknown as Namespace;
      const payload = {
        notificationId: 'n1',
        complexId: 'c1',
        bookingId: 'b1',
        type: 'PROOF_SUBMITTED' as const,
        payerName: 'Juan',
        declaredAmount: 4000,
        createdAt: '2026-09-12T14:00:00.000Z',
      };

      gateway.emitNotificationCreated(payload);

      expect(to).toHaveBeenCalledWith('complex:c1');
      expect(emit).toHaveBeenCalledWith('notification.created', payload);
    });
  });
});
