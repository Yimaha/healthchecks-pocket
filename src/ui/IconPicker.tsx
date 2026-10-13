import { useEffect, useState, type ChangeEvent } from 'react'
import type { HealthchecksApi } from '../core/api'
import { assignmentKey, PRESETS, presetRef, type IconRef } from '../core/icons'
import type { Account } from '../core/types'
import { ErrorBanner, Header } from './common'
import { useAsync } from './hooks'
import { IconCropper } from './IconCropper'
import { cropToDataUrl, decodeImage, type DecodedImage } from './imageTools'
import { JobIcon } from './JobIcon'
import { useIcons } from './jobIcons'
import { href } from './routes'

const ACCEPT = 'image/*,.heic,.heif,.ico,.svg,.bmp,.avif,.webp'

/** Choose a check's icon: a preset, one of your uploads, or a new upload
 *  (cropped to a square). Icons other checks use are marked, but can still
 *  be picked. */
export function IconPicker({ api, account, id }: { api: HealthchecksApi; account: Account; id: string }) {
  const check = useAsync(() => api.getCheck(id), [api, id])
  const icons = useIcons()
  const key = assignmentKey(account.id, id)
  const current = icons.assigned[key]
  const [image, setImage] = useState<DecodedImage>()
  const [error, setError] = useState<Error>()

  useEffect(() => {
    if (icons.loaded && check.data) icons.ensure(account.id, [check.data])
  }, [icons, check.data, account.id])

  const inUse = new Set(Object.entries(icons.assigned).filter(([k]) => k.startsWith(`${account.id}/`) && k !== key).map(([, r]) => r))
  const back = () => history.back()
  const choose = (ref: IconRef) => {
    icons.set(key, ref)
    back()
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // choosing the same file again still works
    if (!file) return
    setError(undefined)
    try {
      setImage(await decodeImage(file))
    } catch (err) {
      setError(err as Error)
    }
  }

  const tile = (ref: IconRef, label: string, extra?: React.ReactNode) => (
    <div key={ref} className="icon-choice">
      <button
        type="button"
        className={`icon-choice-button${ref === current ? ' current' : ''}`}
        aria-label={label + (inUse.has(ref) ? ' (in use)' : '')}
        aria-pressed={ref === current}
        onClick={() => choose(ref)}
      >
        <JobIcon iconRef={ref} size="md" />
        {inUse.has(ref) && <span className="icon-in-use" aria-hidden="true" />}
      </button>
      {extra}
    </div>
  )

  return (
    <>
      <Header title="Icon" back={href({ name: 'check', id })} />
      <main className="page">
        {check.error && <ErrorBanner error={check.error} onRetry={check.reload} />}
        <section className="card icon-current">
          <JobIcon iconRef={current} size="lg" />
          <span className="check-name">{check.data?.name || check.data?.slug || 'Check'}</span>
        </section>

        {image ? (
          <IconCropper
            image={image}
            onCancel={() => setImage(undefined)}
            onSave={(box) => {
              const id = icons.addCustom(cropToDataUrl(image, box))
              choose(`custom:${id}`)
            }}
          />
        ) : (
          <>
            <h2 className="section-title">Your icons</h2>
            {error && <ErrorBanner error={error} />}
            <div className="icon-grid">
              {Object.keys(icons.custom).map((cid) => tile(`custom:${cid}`, 'Your icon', (
                <button
                  type="button"
                  className="icon-delete"
                  aria-label="Delete this icon"
                  onClick={() => {
                    if (confirm('Delete this icon? Checks using it go back to their default icon.')) icons.removeCustom(cid)
                  }}
                >
                  ×
                </button>
              )))}
              <label className="icon-upload">
                <input type="file" accept={ACCEPT} onChange={upload} aria-label="Upload an image" />
                <span aria-hidden="true">+</span>
                <span className="icon-upload-text">Upload</span>
              </label>
            </div>
            <p className="hint-text">PNG, JPEG, WebP, GIF, BMP, AVIF, SVG or ICO. You crop it to a square next.</p>

            <h2 className="section-title">Icons</h2>
            <div className="icon-grid">
              {PRESETS.map((p) => tile(presetRef(p.id), p.label))}
            </div>
            <p className="hint-text">A dot marks icons other checks in this project use; you can still pick them.</p>
          </>
        )}
      </main>
    </>
  )
}
