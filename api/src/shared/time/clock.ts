/**
 * Fuente de "ahora" inyectable. Toda regla que dependa del tiempo actual la recibe por acá,
 * nunca llama a `new Date()` directamente, para que los tests fijen el instante sin mocks globales.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Reloj fijo para tests. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = date;
  }
}
