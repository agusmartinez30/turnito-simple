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
