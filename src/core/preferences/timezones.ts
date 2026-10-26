// Time zone choices for showing absolute timestamps. "system" follows the
// device, so the default stays right when the phone changes zone.

export const SYSTEM_TZ = 'system';

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function resolveTimeZone(choice: string): string {
  return choice === SYSTEM_TZ ? systemTimeZone() : choice;
}

/** "UTC+2", "UTC+5:30", "UTC" for a zone right now. */
export function offsetLabel(tz: string, at = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    // Newer ICU versions write UTC itself as "GMT+0".
    return (name ?? 'GMT').replace('GMT', 'UTC').replace(/^UTC[+-]0(:00)?$/, 'UTC');
  } catch {
    return '';
  }
}

export interface TimeZoneOption {
  value: string;
  label: string;
}

let cached: TimeZoneOption[] | undefined;

/** System default first (marked), then UTC, then every IANA zone A-Z. */
export function timeZoneOptions(): TimeZoneOption[] {
  if (cached) {
    return cached;
  }
  const systemZone = systemTimeZone();
  const label = (tz: string) => `${tz.replace(/_/g, ' ')} (${offsetLabel(tz)})`;
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = []; // very old WebViews: system default and UTC only
  }
  cached = [
    { value: SYSTEM_TZ, label: `${label(systemZone)}, default` },
    ...(systemZone === 'UTC' ? [] : [{ value: 'UTC', label: 'UTC' }]),
    ...zones.filter((tz) => tz !== 'UTC' && tz !== 'Etc/UTC').map((tz) => ({ value: tz, label: label(tz) })),
  ];
  return cached;
}
