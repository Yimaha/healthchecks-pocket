import { useCallback, useEffect, useState } from 'react';
import { settings, type SettingKey } from '@/core/storage/storage';

/** A value remembered on this device (e.g. a folded section, a text size).
 *  Values that don't parse fall back to `initial`. */
function useStored<T>(key: SettingKey, initial: T, parse: (raw: string) => T | undefined, format: (value: T) => string): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    void settings.get(key).then((raw) => {
      const value = raw == null ? undefined : parse(raw);
      if (value !== undefined) {
        setValue(value);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((value: T) => {
    setValue(value);
    void settings.set(key, format(value)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, set];
}

/** A boolean remembered on this device. */
export function useStoredFlag(key: SettingKey, initial: boolean): [boolean, (value: boolean) => void] {
  return useStored(key, initial, (raw) => raw === '1', (on) => (on ? '1' : '0'));
}

/** A whole number remembered on this device, kept within [min, max]. */
export function useStoredNumber(key: SettingKey, initial: number, min: number, max: number): [number, (value: number) => void] {
  return useStored(
    key,
    initial,
    (raw) => {
      const value = Number(raw);
      return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
    },
    String,
  );
}
