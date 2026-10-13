import { createElement } from 'react'
import { presetOf, type IconRef } from '../core/icons'
import type { CheckStatus } from '../core/types'
import { StatusDot } from './common'
import { useIcons } from './jobIcons'
import { GLYPHS } from './presetGlyphs'

/** A check's icon: a preset's white glyph on its coloured tile, or the image
 *  the user uploaded; optionally with the status dot on its corner. */
export function JobIcon({ iconRef, size, status, started }: {
  iconRef: IconRef | undefined
  size: 'sm' | 'md' | 'lg'
  status?: CheckStatus
  started?: boolean
}) {
  const { custom } = useIcons()
  const preset = presetOf(iconRef)
  const glyph = preset && GLYPHS[preset.id]
  const image = iconRef?.startsWith('custom:') ? custom[iconRef.slice(7)] : undefined
  return (
    <span className={`job-icon job-icon-${size}`} aria-hidden="true">
      {image ? (
        <img className="job-icon-tile" src={image} alt="" />
      ) : (
        <span className="job-icon-tile" style={preset ? { background: preset.color } : undefined}>
          {glyph && createElement(glyph, { className: 'job-icon-glyph', strokeWidth: 2 })}
        </span>
      )}
      {status && <span className="job-icon-status"><StatusDot status={status} started={started} /></span>}
    </span>
  )
}
