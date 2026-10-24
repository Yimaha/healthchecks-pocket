import { DEFAULT_BACKGROUND_MODE, DEFAULT_THEME_MODE, type BackgroundMode, type ThemeMode } from '@/core/theme';
import { BACKGROUND_LABEL, THEME_LABEL, useTheme } from './theme';

/** Appearance: the theme and the background, each a titled dropdown; a
 *  choice applies at once. */
export function ThemePicker({ defaultNote }: { defaultNote?: boolean }) {
  const { mode, setMode, background, setBackground } = useTheme();
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
        <select className="picker" value={background} onChange={(event) => setBackground(event.target.value as BackgroundMode)}>
          {(Object.keys(BACKGROUND_LABEL) as BackgroundMode[]).map((backgroundMode) => (
            <option key={backgroundMode} value={backgroundMode}>{BACKGROUND_LABEL[backgroundMode]}{note(backgroundMode === DEFAULT_BACKGROUND_MODE)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
