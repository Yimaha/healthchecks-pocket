import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { check, failBody, UUID } from '../fixtures/healthchecks'
import { fakeServer, startApp, text } from '../helpers'

const open = (n: number) => startApp({ hash: `#/check/${UUID}/ping/${n}` })
const lines = () => [...document.querySelectorAll('pre.body .line')].map((l) => [l.className.replace('line line-', ''), l.textContent?.trimEnd()])

describe('ping body', () => {
  it('shows the body with each line highlighted by its log level', async () => {
    fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/27`]: failBody } }])
    open(27)
    await waitFor(() => expect(lines()).toHaveLength(5))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ping #27')
    expect(lines()).toEqual([
      ['plain', 'FAIL (1 failing, 0 warnings)'],
      ['error', '[ERROR] backup: upload failed'],
      ['debug', '[DEBUG] retrying (3/3)'],
      ['warn', 'level=warn disk almost full'],
      ['info', 'INFO: done'],
    ])
  })

  it('keeps the body text exactly as sent', async () => {
    const body = '  indented\n\ttab\n\n== section\n'
    fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/3`]: body } }])
    open(3)
    await waitFor(() => expect(document.querySelector('pre.body')).not.toBeNull())
    expect(document.querySelector('pre.body')!.textContent).toBe(body + '\n')
  })

  it('says when a ping has no body', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }])
    open(1)
    expect(await screen.findByText('This ping has no body.')).toBeTruthy()
  })

  it('shows errors with Retry', async () => {
    const server = fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/2`]: 'ok' } }])
    server.fail(/body$/, 503)
    open(2)
    expect(text(await screen.findByRole('alert'))).toBe('Healthchecks.io is temporarily unavailable. Retry')
    screen.getByRole('button', { name: 'Retry' }).click()
    await waitFor(() => expect(document.querySelector('pre.body')?.textContent).toBe('ok\n'))
  })

  it('goes back to the check', async () => {
    fakeServer([{ key: 'key-home', checks: [check], bodies: {} }])
    open(1)
    expect((await screen.findByRole('link', { name: 'Back' })).getAttribute('href')).toBe(`#/check/${UUID}`)
  })
})
