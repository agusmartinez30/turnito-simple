import { formatInTimeZone } from 'date-fns-tz';
import { businessDateOf, closesNextDay, generateSlots } from './slots';

const BA = 'America/Argentina/Buenos_Aires';
const fmt = (d: Date, tz = BA) => formatInTimeZone(d, tz, 'HH:mm');
const fmtDate = (d: Date, tz = BA) => formatInTimeZone(d, tz, 'yyyy-MM-dd');

describe('generateSlots', () => {
  it('08:00–23:00 con 90 min → 10 slots, el último 21:30–23:00', () => {
    const slots = generateSlots({
      date: '2026-09-13',
      timezone: BA,
      openTime: '08:00',
      closeTime: '23:00',
      slotDurationMinutes: 90,
    });
    expect(slots).toHaveLength(10);
    expect(fmt(slots[0].startsAt)).toBe('08:00');
    expect(fmt(slots[9].startsAt)).toBe('21:30');
    expect(fmt(slots[9].endsAt)).toBe('23:00');
  });

  it('18:00–22:00 con 90 min → 2 slots; el parcial 21:00–22:30 se descarta', () => {
    const slots = generateSlots({
      date: '2026-09-13',
      timezone: BA,
      openTime: '18:00',
      closeTime: '22:00',
      slotDurationMinutes: 90,
    });
    expect(slots.map((s) => fmt(s.startsAt))).toEqual(['18:00', '19:30']);
  });

  it('10:00–23:00 con 60 min → 13 slots', () => {
    const slots = generateSlots({
      date: '2026-09-13',
      timezone: BA,
      openTime: '10:00',
      closeTime: '23:00',
      slotDurationMinutes: 60,
    });
    expect(slots).toHaveLength(13);
  });

  it('openTime === closeTime → []', () => {
    const base = { date: '2026-09-13', timezone: BA, slotDurationMinutes: 60 };
    expect(
      generateSlots({ ...base, openTime: '10:00', closeTime: '10:00' }),
    ).toEqual([]);
  });

  it('closeTime < openTime → cierra al día siguiente: 22:00–01:00 con 90 min → 22:00 y 23:30 (termina 01:00 del día siguiente)', () => {
    const slots = generateSlots({
      date: '2026-09-13',
      timezone: BA,
      openTime: '22:00',
      closeTime: '01:00',
      slotDurationMinutes: 90,
    });
    expect(slots.map((s) => fmt(s.startsAt))).toEqual(['22:00', '23:30']);
    expect(fmtDate(slots[1].startsAt)).toBe('2026-09-13');
    expect(fmt(slots[1].endsAt)).toBe('01:00');
    expect(fmtDate(slots[1].endsAt)).toBe('2026-09-14');
  });

  it('20:00–00:00 con 60 min → 4 slots, el último termina a medianoche', () => {
    const slots = generateSlots({
      date: '2026-09-13',
      timezone: BA,
      openTime: '20:00',
      closeTime: '00:00',
      slotDurationMinutes: 60,
    });
    expect(slots).toHaveLength(4);
    expect(fmt(slots[3].endsAt)).toBe('00:00');
    expect(fmtDate(slots[3].endsAt)).toBe('2026-09-14');
  });

  it('los startsAt son instantes UTC que, formateados en el tz del complejo, dan openTime + k·duración', () => {
    const slots = generateSlots({
      date: '2026-09-13',
      timezone: BA,
      openTime: '08:00',
      closeTime: '23:00',
      slotDurationMinutes: 90,
    });
    // Buenos Aires es UTC-3: 08:00 local = 11:00Z
    expect(slots[0].startsAt.toISOString()).toBe('2026-09-13T11:00:00.000Z');
    slots.forEach((slot, k) => {
      const minutes = 8 * 60 + k * 90;
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      expect(fmt(slot.startsAt)).toBe(`${hh}:${mm}`);
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(90 * 60_000);
    });
  });

  it('en un día de cambio DST (America/New_York) la cantidad y duración en ms de los slots se mantienen fijas', () => {
    // 2026-03-08: a las 02:00 local se salta a las 03:00 (el día local dura 23 h).
    const ny = 'America/New_York';
    const slots = generateSlots({
      date: '2026-03-08',
      timezone: ny,
      openTime: '00:00',
      closeTime: '12:00',
      slotDurationMinutes: 60,
    });
    // open=00:00 EST (05:00Z), close=12:00 EDT (16:00Z) → 11 h reales → 11 slots de 60 min.
    expect(slots).toHaveLength(11);
    for (const slot of slots) {
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(60 * 60_000);
    }
    expect(fmt(slots[0].startsAt, ny)).toBe('00:00');
    expect(fmt(slots[10].endsAt, ny)).toBe('12:00');
  });
});

describe('closesNextDay / businessDateOf', () => {
  const lateNight = { openTime: '18:00', closeTime: '01:00' };
  const daytime = { openTime: '08:00', closeTime: '23:00' };

  it('closesNextDay: solo cuando closeTime < openTime', () => {
    expect(closesNextDay(lateNight)).toBe(true);
    expect(closesNextDay(daytime)).toBe(false);
    expect(closesNextDay({ openTime: '10:00', closeTime: '10:00' })).toBe(
      false,
    );
  });

  it('un turno de madrugada pertenece al día anterior; desde closeTime en adelante, al día calendario', () => {
    const at = (iso: string) => new Date(iso);
    expect(businessDateOf(at('2026-09-14T00:30:00-03:00'), lateNight, BA)).toBe(
      '2026-09-13',
    );
    expect(businessDateOf(at('2026-09-13T18:00:00-03:00'), lateNight, BA)).toBe(
      '2026-09-13',
    );
    // Exactamente a closeTime ya no es de la grilla anterior.
    expect(businessDateOf(at('2026-09-14T01:00:00-03:00'), lateNight, BA)).toBe(
      '2026-09-14',
    );
  });

  it('cancha sin cruce de medianoche → siempre el día calendario local', () => {
    expect(
      businessDateOf(new Date('2026-09-14T00:30:00-03:00'), daytime, BA),
    ).toBe('2026-09-14');
  });
});
