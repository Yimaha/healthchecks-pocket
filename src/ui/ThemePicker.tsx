import { DEFAULT_LIGHTS_MODE, DEFAULT_THEME_MODE, type LightsMode, type ThemeMode } from '../core/theme';
import { LIGHTS_LABEL, THEME_LABEL, useTheme } from './theme';

/** Appearance: the theme and the background, each a titled dropdown; a
 *  choice applies at once. */
export function ThemePicker({ defaultNote }: { defaultNote?: boolean }) {
  const { mode, setMode, lights, setLights } = useTheme();
  const note = (isDefault: boolean) => (defaultNote && isDefault ? ' (default)' : '');
  return (
    <div className="card appearance">
      <label className="field">
        <span className="field-title">Theme</span>
        <select className="picker" value={mode} onChange={(event) => setMode(event.target.value as ThemeMode)}>
          {(Object.keys(THEME_LABEL) as ThemeMode[]).map((themeMode) => (
            <option key={themeMode} value={themeMode}>{THEME_LABEL[themeMode]}{note(themeMode === DEFAULT_THEME_MODE)}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-title">Background</span>
        <select className="picker" value={lights} onChange={(event) => setLights(event.target.value as LightsMode)}>
          {(Object.keys(LIGHTS_LABEL) as LightsMode[]).map((lightsMode) => (
            <option key={lightsMode} value={lightsMode}>{LIGHTS_LABEL[lightsMode]}{note(lightsMode === DEFAULT_LIGHTS_MODE)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
