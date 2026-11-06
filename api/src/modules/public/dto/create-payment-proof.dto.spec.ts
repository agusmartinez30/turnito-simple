import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentProofDto } from './create-payment-proof.dto';

/** Multipart text fields always arrive as strings. */
async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreatePaymentProofDto, body);
  const errors = await validate(dto);
  return { dto, fields: errors.map((e) => e.property) };
}

describe('CreatePaymentProofDto', () => {
  it('accepts a valid body, trims the name and converts numeric strings', async () => {
    const { dto, fields } = await check({
      payerName: '  Juan Pérez ',
      playersCount: '3',
      amount: '5000',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({
      payerName: 'Juan Pérez',
      playersCount: 3,
      amount: 5000,
    });
  });

  it('treats playersCount as optional (absent or empty)', async () => {
    expect((await check({ payerName: 'A', amount: '10' })).fields).toEqual([]);
    const empty = await check({
      payerName: 'A',
      amount: '10',
      playersCount: '',
    });
    expect(empty.fields).toEqual([]);
    expect(empty.dto.playersCount).toBeUndefined();
  });

  it.each([['' as const], ['   ' as const], [undefined]])(
    'rejects a blank or missing name (%p)',
    async (payerName) => {
      expect((await check({ payerName, amount: '10' })).fields).toContain(
        'payerName',
      );
    },
  );

  it('rejects a name over 100 characters', async () => {
    const { fields } = await check({
      payerName: 'x'.repeat(101),
      amount: '10',
    });
    expect(fields).toContain('payerName');
    expect(
      (await check({ payerName: 'x'.repeat(100), amount: '10' })).fields,
    ).toEqual([]);
  });

  it.each(['0', '51', '-1', '1.5', 'abc'])(
    'rejects playersCount %p',
    async (playersCount) => {
      expect(
        (await check({ payerName: 'A', amount: '10', playersCount })).fields,
      ).toContain('playersCount');
    },
  );

  it.each(['1', '50'])(
    'accepts playersCount bound %p',
    async (playersCount) => {
      expect(
        (await check({ payerName: 'A', amount: '10', playersCount })).fields,
      ).toEqual([]);
    },
  );

  it.each([undefined, '', '0', '-5', '10.5', 'abc'])(
    'rejects amount %p',
    async (amount) => {
      expect((await check({ payerName: 'A', amount })).fields).toContain(
        'amount',
      );
    },
  );
});
