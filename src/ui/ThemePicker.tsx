import { DEFAULT_LIGHTS_MODE, DEFAULT_THEME_MODE, type LightsMode, type ThemeMode } from '../core/theme'
import { LIGHTS_LABEL, THEME_LABEL, useTheme } from './theme'

/** Appearance: the theme and the background, each a titled dropdown; a
 *  choice applies at once. */
export function ThemePicker({ defaultNote }: { defaultNote?: boolean }) {
  const { mode, setMode, lights, setLights } = useTheme()
  const note = (isDefault: boolean) => (defaultNote && isDefault ? ' (default)' : '')
  return (
    <div className="card appearance">
      <label className="field">
        <span className="field-title">Theme</span>
        <select className="picker" value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
          {(Object.keys(THEME_LABEL) as ThemeMode[]).map((m) => (
            <option key={m} value={m}>{THEME_LABEL[m]}{note(m === DEFAULT_THEME_MODE)}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-title">Background</span>
        <select className="picker" value={lights} onChange={(e) => setLights(e.target.value as LightsMode)}>
          {(Object.keys(LIGHTS_LABEL) as LightsMode[]).map((l) => (
            <option key={l} value={l}>{LIGHTS_LABEL[l]}{note(l === DEFAULT_LIGHTS_MODE)}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
