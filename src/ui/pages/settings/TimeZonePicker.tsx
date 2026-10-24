import { useMemo } from 'react';
import { timeZoneOptions } from '@/core/preferences/timezones';
import { useTimeZone } from '@/ui/state/timeZoneState';

/** The zone every exact time in the app is shown in, as a dropdown; a choice applies at once. */
export function TimeZonePicker() {
  const timeZone = useTimeZone();
  const tzOptions = useMemo(() => timeZoneOptions(), []);
  return (
    <div className="card">
      <label className="field">
        <span className="hint">Times in the app are shown in</span>
        <select className="tz-picker" value={timeZone.choice} onChange={(event) => timeZone.setChoice(event.target.value)}>
          {tzOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
  );
}
