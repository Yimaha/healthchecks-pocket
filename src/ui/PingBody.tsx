import type { HealthchecksApi } from '../core/api'
import { lineLevel } from '../core/format'
import { ErrorBanner, Header } from './common'
import { useAsync } from './hooks'
import { href } from './routes'

/** The body a job sent with its ping, with levelled lines highlighted. */
export function PingBody({ api, id, n }: { api: HealthchecksApi; id: string; n: number }) {
  const check = useAsync(() => api.getCheck(id), [api, id])
  const uuid = check.data?.uuid
  const body = useAsync<string | null | undefined>(
    () => (uuid ? api.pingBody(uuid, n) : Promise.resolve(undefined)),
    [api, uuid, n],
  )

  return (
    <>
      <Header title={`Ping #${n}`} back={href({ name: 'check', id })} />
      <main className="page">
        {(check.error || body.error) && <ErrorBanner error={(check.error || body.error)!} onRetry={body.reload} />}
        {body.loading && <p className="empty">Loading…</p>}
        {!body.loading && body.data === null && <p className="empty">This ping has no body.</p>}
        {body.data && (
          <pre className="body">
            {body.data.split('\n').map((line, i) => (
              <span key={i} className={`line line-${lineLevel(line)}`}>{line}{'\n'}</span>
            ))}
          </pre>
        )}
      </main>
    </>
  )
}
