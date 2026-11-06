import { customerSearch, customerWhere } from './customer-search';

describe('customerWhere', () => {
  const contains = (q: string) => ({ contains: q, mode: 'insensitive' });

  it('un token busca en nombre, apellido o teléfono', () => {
    expect(customerWhere('ana')).toEqual({
      AND: [
        {
          OR: [
            { firstName: contains('ana') },
            { lastName: contains('ana') },
            { phone: contains('ana') },
          ],
        },
      ],
    });
  });

  it('varios tokens se AND-ean: "ana perez" exige los dos', () => {
    const where = customerWhere('ana perez');
    expect(where.AND).toHaveLength(2);
  });

  it('ignora los espacios de más', () => {
    expect(customerWhere('  ana   perez  ').AND).toHaveLength(2);
  });

  it('no escapa a mano: Prisma trata % y _ como literales en contains', () => {
    expect(customerWhere('car%los').AND).toEqual([
      {
        OR: [
          { firstName: contains('car%los') },
          { lastName: contains('car%los') },
          { phone: contains('car%los') },
        ],
      },
    ]);
  });
});

describe('customerSearch', () => {
  it('filtra la reserva por su cliente relacionado', () => {
    expect(customerSearch('ana')).toEqual({
      customer: { is: customerWhere('ana') },
    });
  });
});
