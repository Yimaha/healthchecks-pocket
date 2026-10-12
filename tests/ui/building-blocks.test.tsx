import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoadingAurora } from '../../src/ui/Aurora'
import { RefreshButton, Section } from '../../src/ui/common'
import { useAsync, useAutoRefresh, useNow, useStoredFlag } from '../../src/ui/hooks'
import { parseRoute, useRoute } from '../../src/ui/routes'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAsync', () => {
  it('ignores a slow earlier response that arrives after a newer one', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const { result, rerender } = renderHook(({ id }) => useAsync(() => (id === 1 ? first.promise : second.promise), [id]), {
      initialProps: { id: 1 },
    })
    rerender({ id: 2 })
    await act(async () => second.resolve('newer'))
    await act(async () => first.resolve('stale'))
    expect(result.current.data).toBe('newer')
  })

  it('keeps showing the last data while reloading, and records when it loaded', async () => {
    let n = 0
    const next = deferred<number>()
    const { result } = renderHook(() => useAsync(() => (++n === 1 ? Promise.resolve(1) : next.promise), []))
    await waitFor(() => expect(result.current.data).toBe(1))
    const firstLoad = result.current.updatedAt
    expect(firstLoad).toBeTypeOf('number')
    act(() => result.current.reload())
    expect(result.current).toMatchObject({ data: 1, loading: true })
    await act(async () => next.resolve(2))
    expect(result.current).toMatchObject({ data: 2, loading: false })
  })

  it('keeps the data and reports the error when a reload fails', async () => {
    let n = 0
    const { result } = renderHook(() =>
      useAsync(() => (++n === 1 ? Promise.resolve('ok') : Promise.reject(new Error('down'))), []),
    )
    await waitFor(() => expect(result.current.data).toBe('ok'))
    await act(async () => result.current.reload())
    expect(result.current).toMatchObject({ data: 'ok', loading: false })
    expect(result.current.error?.message).toBe('down')
  })
})

describe('useAutoRefresh', () => {
  it('runs on the interval only while the app is visible, and right away when it comes back', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    let visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState)
    renderHook(() => useAutoRefresh(fn, 60_000))
    vi.advanceTimersByTime(60_000)
    expect(fn).toHaveBeenCalledTimes(1)
    visibility = 'hidden'
    vi.advanceTimersByTime(120_000)
    expect(fn).toHaveBeenCalledTimes(1)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('useNow', () => {
  it('ticks every second', () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const { result } = renderHook(() => useNow())
    expect(result.current).toBe(1_000_000)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(1_001_000)
  })
})

describe('useStoredFlag', () => {
  it('uses the default, then whatever was saved on this device', async () => {
    const { result } = renderHook(() => useStoredFlag('section.x', true))
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(localStorage.getItem('healthchecks-pocket.section.x')).toBe('0')

    const again = renderHook(() => useStoredFlag('section.x', true))
    await waitFor(() => expect(again.result.current[0]).toBe(false))
  })
})

describe('Section', () => {
  it('folds and unfolds its content, with aria-expanded and a count', () => {
    render(<Section id="s" title="Things" count={4}><p>content</p></Section>)
    const toggle = screen.getByRole('button', { name: /Things/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('Things4')
    fireEvent.click(toggle)
    expect(screen.queryByText('content')).toBeNull()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('content')).toBeTruthy()
  })
})

describe('RefreshButton', () => {
  const spin = () => !!document.querySelector('.spinning')
  const bar = () => document.querySelector('[role="progressbar"]')

  it('background loading spins the icon only', () => {
    render(<RefreshButton loading onClick={() => {}} />)
    expect(spin()).toBe(true)
    expect(bar()).toBeNull()
  })

  it('a tap shows the bar until loading finishes and at least 800ms have passed', () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    const { rerender } = render(<RefreshButton loading={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<RefreshButton loading onClick={onClick} />)
    act(() => vi.advanceTimersByTime(2000)) // slow load: bar stays as long as it's loading
    expect(bar()).not.toBeNull()
    rerender(<RefreshButton loading={false} onClick={onClick} />)
    act(() => vi.advanceTimersByTime(0))
    expect(bar()).toBeNull()
    expect(spin()).toBe(false)
  })

  it('ignores taps while busy', () => {
    const onClick = vi.fn()
    render(<RefreshButton loading onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('useRoute', () => {
  it('follows hash changes and scrolls to the top', async () => {
    const scroll = vi.spyOn(window, 'scrollTo')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'list' })
    act(() => {
      window.location.hash = '#/settings'
    })
    await waitFor(() => expect(result.current).toEqual(parseRoute('#/settings')))
    expect(scroll).toHaveBeenCalledWith(0, 0)
  })
})

describe('LoadingAurora (the northern-lights background)', () => {
  const lights = () => document.querySelector('.aurora-loading')
  const leaving = () => !!lights()?.classList.contains('aurora-leaving')
  const at = (ms: number) => act(() => vi.advanceTimersByTime(ms - performance.now()))

  it('shows while busy, at least 900ms in all, then fades for 600ms and goes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'], now: 0 })
    at(1000)
    const { rerender } = render(<LoadingAurora mode="loading" busy lastStart={1000} lastEnd={0} />)
    expect(lights()).not.toBeNull()
    at(1100)
    rerender(<LoadingAurora mode="loading" busy={false} lastStart={1000} lastEnd={1100} />) // a 100ms load
    expect(leaving()).toBe(false)
    at(1899)
    expect(leaving()).toBe(false)
    at(1900)
    expect(leaving()).toBe(true)
    at(2499)
    expect(lights()).not.toBeNull()
    at(2500)
    expect(lights()).toBeNull()
  })

  it('a long load fades as soon as it ends', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'], now: 0 })
    at(1000)
    const { rerender } = render(<LoadingAurora mode="loading" busy lastStart={1000} lastEnd={0} />)
    at(4000)
    expect(leaving()).toBe(false) // still busy
    rerender(<LoadingAurora mode="loading" busy={false} lastStart={1000} lastEnd={4000} />)
    at(4000) // (runs what's due now)
    expect(leaving()).toBe(true)
    at(4600)
    expect(lights()).toBeNull()
  })

  it('shows even for a load that started and ended within one update', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'], now: 0 })
    at(1000)
    render(<LoadingAurora mode="loading" busy={false} lastStart={1000} lastEnd={1001} />)
    expect(lights()).not.toBeNull()
    at(2500)
    expect(lights()).toBeNull()
  })

  it('shows nothing before the first load', () => {
    render(<LoadingAurora mode="loading" busy={false} lastStart={0} lastEnd={0} />)
    expect(lights()).toBeNull()
  })

  it('always: shown even when nothing loads; breathing: shown and fading on and off; off: never', () => {
    const { rerender } = render(<LoadingAurora mode="always" busy={false} lastStart={0} lastEnd={0} />)
    expect(lights()).not.toBeNull()
    rerender(<LoadingAurora mode="breathing" busy={false} lastStart={0} lastEnd={0} />)
    expect(document.querySelector('.aurora')!.className).toBe('aurora aurora-breathing')
    rerender(<LoadingAurora mode="off" busy lastStart={1} lastEnd={0} />)
    expect(document.querySelector('.aurora')).toBeNull()
  })
})
