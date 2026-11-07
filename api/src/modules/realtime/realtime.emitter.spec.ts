import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeEmitter', () => {
  it('forwards only complexId, bookingId and kind to the gateway', () => {
    const emitPaymentChanged = jest.fn();
    const emitter = new RealtimeEmitter({
      emitPaymentChanged,
    } as unknown as RealtimeGateway);

    emitter.paymentChanged({
      complexId: 'c1',
      bookingId: 'b1',
      kind: 'proof_submitted',
      payerName: 'Juan',
      fileKey: 'secret',
    } as never);

    expect(emitPaymentChanged).toHaveBeenCalledWith({
      complexId: 'c1',
      bookingId: 'b1',
      kind: 'proof_submitted',
    });
  });

  it('never throws when the gateway fails', () => {
    const emitter = new RealtimeEmitter({
      emitPaymentChanged: () => {
        throw new Error('server not ready');
      },
    } as unknown as RealtimeGateway);

    expect(() =>
      emitter.paymentChanged({
        complexId: 'c1',
        bookingId: 'b1',
        kind: 'payment_voided',
      }),
    ).not.toThrow();
  });
});

describe('RealtimeEmitter.notificationCreated', () => {
  const payload = {
    notificationId: 'n1',
    complexId: 'c1',
    bookingId: 'b1',
    type: 'PROOF_SUBMITTED' as const,
    payerName: 'Juan',
    declaredAmount: 4000,
    createdAt: '2026-09-12T14:00:00.000Z',
  };

  it('forwards exactly the notification fields to the gateway', () => {
    const emitNotificationCreated = jest.fn();
    const emitter = new RealtimeEmitter({
      emitNotificationCreated,
    } as unknown as RealtimeGateway);

    emitter.notificationCreated({
      ...payload,
      fileKey: 'secret',
    } as never);

    expect(emitNotificationCreated).toHaveBeenCalledWith(payload);
  });

  it('never throws when the gateway fails', () => {
    const emitter = new RealtimeEmitter({
      emitNotificationCreated: () => {
        throw new Error('server not ready');
      },
    } as unknown as RealtimeGateway);

    expect(() => emitter.notificationCreated(payload)).not.toThrow();
  });
});
