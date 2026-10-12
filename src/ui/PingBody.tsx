import { useEffect, useState } from 'react'
import type { HealthchecksApi } from '../core/api'
import { lineLevel } from '../core/format'
import { platform } from '../platform'
import { ErrorBanner, Header } from './common'
import { useAsync, useStoredFlag, useStoredNumber } from './hooks'
import { CopyIcon, ShareIcon } from './icons'
import { href } from './routes'

const TEXT_SIZE = { min: 10, max: 24, initial: 13 }

/** The body a job sent with its ping, with levelled lines highlighted, and
 *  tools to read it comfortably or pass it on. View settings are remembered
 *  on this device for every ping. */
export function PingBody({ api, id, n }: { api: HealthchecksApi; id: string; n: number }) {
  const check = useAsync(() => api.getCheck(id), [api, id])
  const uuid = check.data?.uuid
  const body = useAsync<string | null | undefined>(
    () => (uuid ? api.pingBody(uuid, n) : Promise.resolve(undefined)),
    [api, uuid, n],
  )
  const [size, setSize] = useStoredNumber('pingBody.size', TEXT_SIZE.initial, TEXT_SIZE.min, TEXT_SIZE.max)
  const [wrap, setWrap] = useStoredFlag('pingBody.wrap', true)
  const [mono, setMono] = useStoredFlag('pingBody.mono', true)
  const [colours, setColours] = useStoredFlag('pingBody.colours', true)
  const [notice, setNotice] = useState<string>()

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
              <span className="viewer-size">
                <button onClick={() => setSize(size - 1)} disabled={size <= TEXT_SIZE.min} aria-label="Smaller text">A−</button>
                <span aria-label="Text size">{size}</span>
                <button onClick={() => setSize(size + 1)} disabled={size >= TEXT_SIZE.max} aria-label="Larger text">A+</button>
              </span>
              <button className="viewer-toggle" onClick={() => setWrap(!wrap)} aria-pressed={wrap}>Wrap</button>
              <button className="viewer-toggle" onClick={() => setMono(!mono)} aria-pressed={mono}>Mono</button>
              <button className="viewer-toggle" onClick={() => setColours(!colours)} aria-pressed={colours}>Colours</button>
            </div>
            <pre
              className={`body${wrap ? '' : ' body-nowrap'}${mono ? '' : ' body-sans'}${colours ? '' : ' body-plain'}`}
              style={{ fontSize: `${size}px` }}
            >
              {text.split('\n').map((line, i) => (
                <span key={i} className={`line line-${lineLevel(line)}`}>{line}{'\n'}</span>
              ))}
            </pre>
          </>
        )}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    </>
  )
}
