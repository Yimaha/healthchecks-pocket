import { createElement } from 'react';
import { presetOf, type IconRef } from '@/core/icons/checkIcons';
import type { CheckStatus } from '@/core/api/types';
import { useIcons } from '@/ui/state/checkIconsState';
import { StatusDot } from '@/ui/components/StatusDot';
import { useGlyph } from './glyphs';

/** A check's icon: a preset's white glyph on its coloured tile, or the image
 *  the user uploaded; optionally with the status dot on its corner. */
export function CheckIcon({ iconRef, size, status, started }: {
  iconRef: IconRef | undefined;
  size: 'sm' | 'md' | 'lg';
  status?: CheckStatus;
  started?: boolean;
}) {
  const { uploads } = useIcons();
  const preset = presetOf(iconRef);
  const glyph = useGlyph(preset?.id);
  const uploadedImage = iconRef?.startsWith('custom:') ? uploads[iconRef.slice('custom:'.length)] : undefined;
  return (
    <span className={`check-icon check-icon-${size}`} aria-hidden="true">
      {uploadedImage ? (
        <img className="check-icon-tile" src={uploadedImage} alt="" />
      ) : (
        <span className="check-icon-tile" style={preset ? { background: preset.color } : undefined}>
          {glyph && createElement(glyph, { className: 'check-icon-glyph', strokeWidth: 2 })}
        </span>
      )}
      {status && <span className="check-icon-status"><StatusDot status={status} started={started} /></span>}
    </span>
  );
}
