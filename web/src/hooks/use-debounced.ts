'use client';

import { useEffect, useState } from 'react';

/** `value` tras `ms` sin cambios: para búsquedas que pegan a la API mientras se tipea. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
