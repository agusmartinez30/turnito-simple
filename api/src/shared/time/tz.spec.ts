import {
  addLocalDays,
  diffLocalDays,
  isValidLocalDate,
  localDateInTz,
  localTimeToUtc,
  startOfLocalWeek,
  weekdayOfLocalDate,
  startOfLocalMonth,
  endOfLocalMonth,
  addLocalMonths,
  toComplexIso,
  todayInTz,
  isValidTimezone,
} from './tz';

const BA = 'America/Argentina/Buenos_Aires';

describe('tz helpers', () => {
  it('todayInTz usa el día del complejo, no el UTC', () => {
    // 01:30Z del 13 es todavía 22:30 del 12 en Buenos Aires.
    const now = new Date('2026-09-13T01:30:00.000Z');
    expect(todayInTz(now, BA)).toBe('2026-09-12');
    expect(todayInTz(now, 'UTC')).toBe('2026-09-13');
    expect(localDateInTz(now, BA)).toBe('2026-09-12');
  });

  it('toComplexIso devuelve ISO con el offset del complejo, nunca Z', () => {
    const d = new Date('2026-09-13T21:00:00.000Z');
    expect(toComplexIso(d, BA)).toBe('2026-09-13T18:00:00-03:00');
    expect(toComplexIso(d, 'UTC')).toBe('2026-09-13T21:00:00Z');
  });

  it('localTimeToUtc convierte hora local del complejo a instante UTC', () => {
    expect(localTimeToUtc('2026-09-13', '18:00', BA).toISOString()).toBe(
      '2026-09-13T21:00:00.000Z',
    );
    expect(() => localTimeToUtc('2026-9-13', '18:00', BA)).toThrow(RangeError);
    expect(() => localTimeToUtc('2026-09-13', '24:00', BA)).toThrow(RangeError);
  });

  it('isValidLocalDate rechaza formato incorrecto y fechas inexistentes', () => {
    expect(isValidLocalDate('2026-09-13')).toBe(true);
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-1-5')).toBe(false);
    expect(isValidLocalDate('13/09/2026')).toBe(false);
  });

  it('addLocalDays hace aritmética de calendario', () => {
    expect(addLocalDays('2026-09-12', 13)).toBe('2026-09-25');
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekdayOfLocalDate: 0 = domingo … 6 = sábado, sin timezone', () => {
    expect(weekdayOfLocalDate('2026-09-13')).toBe(0); // domingo
    expect(weekdayOfLocalDate('2026-09-14')).toBe(1); // lunes
    expect(weekdayOfLocalDate('2026-09-19')).toBe(6); // sábado
    expect(weekdayOfLocalDate('2027-01-01')).toBe(5); // viernes
  });

  it('startOfLocalWeek devuelve el lunes (lunes, sábado, domingo, cruce de mes y de año)', () => {
    expect(startOfLocalWeek('2026-09-14')).toBe('2026-09-14'); // lunes
    expect(startOfLocalWeek('2026-09-12')).toBe('2026-09-07'); // sábado
    expect(startOfLocalWeek('2026-09-13')).toBe('2026-09-07'); // domingo
    expect(startOfLocalWeek('2026-10-01')).toBe('2026-09-28'); // jueves, cruce de mes
    expect(startOfLocalWeek('2027-01-01')).toBe('2026-12-28'); // viernes, cruce de año
  });

  it('startOfLocalMonth / endOfLocalMonth / addLocalMonths (febrero, 31 días, cruce de año)', () => {
    expect(startOfLocalMonth('2026-09-14')).toBe('2026-09-01');
    expect(endOfLocalMonth('2026-09-14')).toBe('2026-09-30');
    expect(endOfLocalMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfLocalMonth('2028-02-10')).toBe('2028-02-29');
    expect(endOfLocalMonth('2026-12-05')).toBe('2026-12-31');
    expect(addLocalMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addLocalMonths('2026-12-14', 1)).toBe('2027-01-01');
    expect(addLocalMonths('2026-01-14', -1)).toBe('2025-12-01');
  });

  it('diffLocalDays cuenta días de calendario, con signo', () => {
    expect(diffLocalDays('2026-09-12', '2026-09-12')).toBe(0);
    expect(diffLocalDays('2026-09-01', '2026-09-30')).toBe(29);
    expect(diffLocalDays('2026-09-28', '2026-10-02')).toBe(4); // cruce de mes
    expect(diffLocalDays('2026-12-30', '2027-01-02')).toBe(3); // cruce de año
    expect(diffLocalDays('2028-02-28', '2028-03-01')).toBe(2); // bisiesto
    expect(diffLocalDays('2026-09-30', '2026-09-01')).toBe(-29);
    expect(diffLocalDays('2026-01-01', '2026-12-31')).toBe(364);
  });
});

describe('isValidTimezone', () => {
  it('acepta IDs IANA incluidos los alias que CLDR no lista como canónicos', () => {
    expect(isValidTimezone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimezone('America/Argentina/Cordoba')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rechaza IDs inexistentes y vacíos', () => {
    expect(isValidTimezone('Marte/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});
