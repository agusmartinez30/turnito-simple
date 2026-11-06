import { computePaymentSummary } from './payment-summary';

describe('computePaymentSummary', () => {
  it('sin pagos → UNPAID con todo el precio pendiente', () => {
    expect(computePaymentSummary(20000, [])).toEqual({
      paidAmount: 0,
      balance: 20000,
      status: 'UNPAID',
    });
  });

  it('pago parcial → PARTIAL', () => {
    expect(
      computePaymentSummary(20000, [{ amount: 2000 }, { amount: 3000 }]),
    ).toEqual({ paidAmount: 5000, balance: 15000, status: 'PARTIAL' });
  });

  it('pago exacto → PAID con balance 0', () => {
    expect(computePaymentSummary(20000, [{ amount: 20000 }])).toEqual({
      paidAmount: 20000,
      balance: 0,
      status: 'PAID',
    });
  });

  it('sobrepago → PAID con balance negativo (saldo a favor)', () => {
    expect(
      computePaymentSummary(20000, [{ amount: 20000 }, { amount: 500 }]),
    ).toEqual({ paidAmount: 20500, balance: -500, status: 'PAID' });
  });

  it('los pagos anulados no cuentan', () => {
    expect(
      computePaymentSummary(20000, [
        { amount: 20000, voidedAt: new Date() },
        { amount: 2000, voidedAt: null },
      ]),
    ).toEqual({ paidAmount: 2000, balance: 18000, status: 'PARTIAL' });
  });

  it('price 0 → PAID aunque no haya pagos', () => {
    expect(computePaymentSummary(0, [])).toEqual({
      paidAmount: 0,
      balance: 0,
      status: 'PAID',
    });
  });
});
