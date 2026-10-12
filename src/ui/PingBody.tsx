import { useEffect, useRef, useState, type TouchEvent } from 'react'
import type { HealthchecksApi } from '../core/api'
import { DEFAULT_TEXT_SIZE, lineLevel, linkify, pinchSize, snapSize, TEXT_SIZES } from '../core/format'
import { platform } from '../platform'
import { ErrorBanner, Header } from './common'
import { useAsync, useStoredFlag, useStoredNumber } from './hooks'
import { CopyIcon, ShareIcon } from './icons'
import { href } from './routes'

/** The body a job sent with its ping, with levelled lines highlighted and
 *  links that open in the browser, and tools to read it comfortably (text
 *  size, pinch to zoom, wrapping) or pass it on. View settings are remembered
 *  on this device for every ping. */
export function PingBody({ api, id, n }: { api: HealthchecksApi; id: string; n: number }) {
  const check = useAsync(() => api.getCheck(id), [api, id])
  const uuid = check.data?.uuid
  const body = useAsync<string | null | undefined>(
    () => (uuid ? api.pingBody(uuid, n) : Promise.resolve(undefined)),
    [api, uuid, n],
  )
  const [stored, setSize] = useStoredNumber('pingBody.size', DEFAULT_TEXT_SIZE, TEXT_SIZES[0], TEXT_SIZES[TEXT_SIZES.length - 1])
  const size = snapSize(stored)
  const [wrap, setWrap] = useStoredFlag('pingBody.wrap', true)
  const [notice, setNotice] = useState<string>()
  // Pinch to zoom: the size follows the fingers, then snaps to a step.
  const [pinching, setPinching] = useState<number>()
  const pinchStart = useRef<{ size: number; distance: number }>(undefined)
  const distance = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) pinchStart.current = { size, distance: distance(e) }
  }
  const onTouchMove = (e: TouchEvent) => {
    const start = pinchStart.current
    if (start && e.touches.length === 2) setPinching(pinchSize(start.size, start.distance, distance(e)))
  }
  const onTouchEnd = () => {
    if (pinching !== undefined) setSize(snapSize(pinching))
    pinchStart.current = undefined
    setPinching(undefined)
  }

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(undefined), 2000)
    return () => clearTimeout(t)
  }, [notice])

  const text = body.data
  const title = `${check.data?.name || 'Check'} · ping #${n}`
  const copy = () => {
    if (!text) return
    platform.copyText(text).then(() => setNotice('Copied'), () => setNotice("Couldn't copy"))
  }
  const share = platform.shareText && (() => {
    if (text) platform.shareText?.(title, text).catch(() => setNotice("Couldn't share"))
  })

  const right = (
    <>
      <button className="icon-button" onClick={copy} disabled={!text} aria-label="Copy"><CopyIcon /></button>
      {share && <button className="icon-button" onClick={share} disabled={!text} aria-label="Share"><ShareIcon /></button>}
    </>
  )

  return (
    <>
      <Header title={`Ping #${n}`} back={href({ name: 'check', id })} right={right} />
      <main className="page">
        {(check.error || body.error) && <ErrorBanner error={(check.error || body.error)!} onRetry={body.reload} />}
        {body.loading && <p className="empty">Loading…</p>}
        {!body.loading && body.data === null && <p className="empty">This ping has no body.</p>}
        {text && (
          <>
            <div className="viewer-bar" role="toolbar" aria-label="Text view">
              <TextSize size={size} onChange={setSize} />
              <button className="viewer-toggle" onClick={() => setWrap(!wrap)} aria-pressed={wrap}>Wrap</button>
            </div>
            <pre
              className={`body${wrap ? '' : ' body-nowrap'}`}
              style={{ fontSize: `${pinching ?? size}px` }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              {text.split('\n').map((line, i) => (
                <span key={i} className={`line line-${lineLevel(line)}`}>
                  {linkify(line).map((part, j) => typeof part === 'string' ? part : (
                    <a
                      key={j}
                      className="body-link"
                      href={part.url}
                      onClick={(e) => { e.preventDefault(); platform.openExternal(part.url) }}
                    >
                      {part.url}
                    </a>
                  ))}
                  {'\n'}
                </span>
              ))}
            </pre>
          </>
        )}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    </>
  )
}

/** A− size A+, stepping through TEXT_SIZES (also used by onboarding). */
export function TextSize({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const step = TEXT_SIZES.indexOf(snapSize(size))
  return (
    <span className="viewer-size">
      <button onClick={() => onChange(TEXT_SIZES[step - 1])} disabled={step <= 0} aria-label="Smaller text">A−</button>
      <span aria-label="Text size">{snapSize(size)}</span>
      <button onClick={() => onChange(TEXT_SIZES[step + 1])} disabled={step >= TEXT_SIZES.length - 1} aria-label="Larger text">A+</button>
    </span>
  )
}
