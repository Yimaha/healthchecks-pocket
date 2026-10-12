import { createContext, useContext } from 'react'
import { SYSTEM_TZ, systemTimeZone } from '../core/timezones'

// The time zone chosen on the home page, used for every absolute timestamp.
// App provides it; `tz` is the resolved IANA name.
export interface TimeZoneState {
  choice: string // SYSTEM_TZ or an IANA zone
  tz: string
  setChoice: (choice: string) => void
}

export const TimeZoneContext = createContext<TimeZoneState>({
  choice: SYSTEM_TZ,
  tz: systemTimeZone(),
  setChoice: () => {},
})

export const useTimeZone = () => useContext(TimeZoneContext)
