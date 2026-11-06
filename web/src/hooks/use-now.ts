'use client';

import { useEffect, useState } from 'react';

/** Reloj que se actualiza cada `intervalMs` mientras `enabled`; sin habilitar devuelve `null`. */
export function useNow(enabled: boolean, intervalMs = 60_000): Date | null {
  const [now, setNow] = useState(() => new Date());
  // Al habilitarse arranca del reloj real, no del último tick (puede ser de hace horas).
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) setNow(new Date());
  }
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs]);
  return enabled ? now : null;
}
