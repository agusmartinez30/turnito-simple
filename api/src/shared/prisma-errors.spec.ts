import { Prisma } from '@prisma/client';
import { isExclusionViolation, isUniqueViolation } from './prisma-errors';

/**
 * Fixtures capturados de errores reales (Prisma 6.19.3 + Postgres 16) para que un cambio de
 * formato en una versión futura rompa este test y no producción.
 */
const uniqueFixture = new Prisma.PrismaClientKnownRequestError(
  'Invalid `p.booking.create()` invocation\n\nUnique constraint failed on the fields: (`court_id`,`starts_at`)',
  {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { modelName: 'Booking', target: ['court_id', 'starts_at'] },
  },
);

const exclusionFixture = new Prisma.PrismaClientUnknownRequestError(
  'Invalid `p.booking.create()` invocation\n\nError occurred during query execution:\n' +
    'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23P01", ' +
    'message: "conflicting key value violates exclusion constraint \\"bookings_user_no_overlap_excl\\"", ' +
    'severity: "ERROR", detail: Some("Key (user_id, tstzrange(starts_at, ends_at, \'[)\'::text))=(6e7e12f6, ' +
    '[\\"2030-01-01 21:30:00+00\\",\\"2030-01-01 23:00:00+00\\")) conflicts with existing key ..."), ' +
    'column: None, hint: None }), transient: false })',
  { clientVersion: '6.19.3' },
);

describe('isUniqueViolation', () => {
  it('detecta P2002 por columnas, sin importar el orden', () => {
    expect(isUniqueViolation(uniqueFixture, ['court_id', 'starts_at'])).toBe(
      true,
    );
    expect(isUniqueViolation(uniqueFixture, ['starts_at', 'court_id'])).toBe(
      true,
    );
  });

  it('no confunde con otro unique ni con otros errores', () => {
    expect(isUniqueViolation(uniqueFixture, ['email'])).toBe(false);
    expect(isUniqueViolation(uniqueFixture, ['court_id'])).toBe(false);
    expect(isUniqueViolation(exclusionFixture, ['court_id', 'starts_at'])).toBe(
      false,
    );
    expect(
      isUniqueViolation(new Error('P2002'), ['court_id', 'starts_at']),
    ).toBe(false);
    expect(isUniqueViolation(null, ['court_id', 'starts_at'])).toBe(false);
  });
});

describe('isExclusionViolation', () => {
  it('detecta la exclusion por código 23P01 + nombre de la constraint en el mensaje', () => {
    expect(
      isExclusionViolation(exclusionFixture, 'bookings_user_no_overlap_excl'),
    ).toBe(true);
  });

  it('acepta también la forma P2004 con el nombre en el mensaje', () => {
    const p2004 = new Prisma.PrismaClientKnownRequestError(
      'A constraint failed on the database: `bookings_user_no_overlap_excl`',
      { code: 'P2004', clientVersion: '6.19.3' },
    );
    expect(isExclusionViolation(p2004, 'bookings_user_no_overlap_excl')).toBe(
      true,
    );
  });

  it('no confunde con otra constraint ni con el unique', () => {
    expect(isExclusionViolation(exclusionFixture, 'otra_constraint')).toBe(
      false,
    );
    expect(
      isExclusionViolation(uniqueFixture, 'bookings_user_no_overlap_excl'),
    ).toBe(false);
    expect(isExclusionViolation('23P01', 'bookings_user_no_overlap_excl')).toBe(
      false,
    );
  });
});
