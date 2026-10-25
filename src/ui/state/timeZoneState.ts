import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTimeZone, SYSTEM_TZ, systemTimeZone } from '@/core/preferences/timezones';
import { settings } from '@/core/storage/storage';

// The time zone chosen in Settings (or onboarding), used for every absolute timestamp.
// App provides it; `tz` is the resolved IANA name.
export interface TimeZoneState {
  choice: string; // SYSTEM_TZ or an IANA zone
  tz: string;
  setChoice: (choice: string) => void;
}

export const TimeZoneContext = createContext<TimeZoneState>({
  choice: SYSTEM_TZ,
  tz: systemTimeZone(),
  setChoice: () => {},
});

export const useTimeZone = () => useContext(TimeZoneContext);

/** The saved choice (the system's zone until it's read, or if none is saved); a new choice is saved. */
export function useTimeZoneState(): TimeZoneState {
  const [tzChoice, setTzChoice] = useState(SYSTEM_TZ);
  useEffect(() => {
    void settings.get('timezone').then((saved) => {
      if (saved) {
        setTzChoice(saved);
      }
    });
  }, []);
  return useMemo(() => ({
    choice: tzChoice,
    tz: resolveTimeZone(tzChoice),
    setChoice: (choice: string) => {
      setTzChoice(choice);
      void settings.set('timezone', choice).catch(() => {});
    },
  }), [tzChoice]);
}
