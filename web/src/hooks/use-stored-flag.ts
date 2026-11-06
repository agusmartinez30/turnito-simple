'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** `storage` solo dispara en OTRAS pestañas; para la misma pestaña usamos un evento propio. */
const CHANGE_EVENT = 'stored-flag-change';
/** Fallback en memoria si localStorage está bloqueado (privado, cuota, políticas). */
const memory = new Map<string, boolean>();

function read(key: string, fallback: boolean): boolean {
  const cached = memory.get(key);
  if (cached !== undefined) return cached;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

/**
 * Boolean persistido por dispositivo en localStorage. Todos los suscriptores de la misma `key`
 * quedan en sincronía (misma pestaña vía evento propio, otras vía `storage`). En SSR y durante
 * la hidratación devuelve `fallback`.
 */
export function useStoredFlag(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === key) onChange();
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(CHANGE_EVENT, onChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(CHANGE_EVENT, onChange);
      };
    },
    () => read(key, fallback),
    () => fallback,
  );

  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
        memory.delete(key);
      } catch {
        memory.set(key, next);
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [value, set];
}
