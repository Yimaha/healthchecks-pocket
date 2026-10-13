import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Box } from '../../src/core/crop'
import type { Check } from '../../src/core/types'
import { check as base, UUID } from '../fixtures/healthchecks'
import { answerConfirms, fakeServer, startApp, text } from '../helpers'

// Canvas decoding/encoding is the browser's job (tested in e2e); here it's a stub.
const cropped: Box[] = []
vi.mock('../../src/ui/imageTools', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/ui/imageTools')>()
  return {
    ...real,
    decodeImage: vi.fn(async (file: File) => {
      if (/hei[cf]/i.test(file.name)) throw new real.UnsupportedImage()
      return { source: document.createElement('canvas'), width: 400, height: 300 }
    }),
    cropToDataUrl: vi.fn((_img: unknown, box: Box) => {
      cropped.push(box)
      return 'data:image/png;base64,ICON'
    }),
  }
})

const mk = (name: string, uuid: string, tags = ''): Check => ({ ...base, name, slug: name, uuid, tags })
const checks = [mk('nightly backup', UUID, 'nas'), mk('website', 'uuid-web'), mk('mystery', 'uuid-x')]
const assigned = () => JSON.parse(localStorage.getItem('healthchecks-pocket.icons.assigned') ?? '{}')
const tileColor = (el: Element | null) => (el?.querySelector('.job-icon-tile') as HTMLElement | null)?.style.background

beforeEach(() => {
  cropped.length = 0
})

describe('job icons', () => {
  it('every check gets a default icon, suggested by its name and not repeated, saved so it stays', async () => {
    fakeServer([{ key: 'key-home', checks }])
    const { unmount } = startApp()
    await waitFor(() => expect(Object.keys(assigned())).toHaveLength(3))
    expect(assigned()).toEqual({ [`p1/${UUID}`]: 'preset:archive', 'p1/uuid-web': 'preset:globe', 'p1/uuid-x': 'preset:server' })
    const rows = [...document.querySelectorAll('.check-row')]
    expect(rows.map((r) => !!r.querySelector('.job-icon-sm .job-icon-glyph'))).toEqual([true, true, true])
    expect(rows.every((r) => r.querySelector('.job-icon-status .dot'))).toBe(true) // the status dot as a badge
    unmount()

    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ ...assigned(), 'p1/uuid-web': 'preset:star' }))
    startApp()
    await waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(3))
    expect(assigned()['p1/uuid-web']).toBe('preset:star') // kept, never reassigned
  })

  it('forgets icons of checks deleted on healthchecks.io', async () => {
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ 'p1/gone': 'preset:moon', 'p9/other': 'preset:sun' }))
    fakeServer([{ key: 'key-home', checks }])
    startApp()
    await waitFor(() => expect(Object.keys(assigned())).toHaveLength(4))
    expect(assigned()['p1/gone']).toBeUndefined()
    expect(assigned()['p9/other']).toBe('preset:sun') // another project's
  })

  it('the check page shows the icon top left; tapping it opens the picker', async () => {
    fakeServer([{ key: 'key-home', checks }])
    startApp({ hash: `#/check/${UUID}` })
    const link = await screen.findByRole('link', { name: 'Change icon' })
    expect(link.getAttribute('href')).toBe(`#/check/${UUID}/icon`)
    await waitFor(() => expect(link.querySelector('.job-icon-lg .job-icon-glyph')).not.toBeNull())
    expect(link.closest('.card-row')?.firstElementChild).toBe(link) // first in the status card
  })

  it('picks a preset (even one another check uses) and goes back', async () => {
    fakeServer([{ key: 'key-home', checks }])
    const { user } = startApp({ hash: `#/check/${UUID}` })
    await user.click(await screen.findByRole('link', { name: 'Change icon' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Icon')
    await screen.findByRole('button', { name: 'Backup' })
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))).toEqual(['Backup'])
    expect(document.querySelectorAll('.icon-grid')[1].querySelectorAll('.icon-choice-button')).toHaveLength(58)

    // The website check has the globe already: marked, but allowed.
    window.location.hash = '#/'
    await waitFor(() => expect(Object.keys(assigned())).toHaveLength(3))
    window.location.hash = `#/check/${UUID}/icon`
    const globe = await screen.findByRole('button', { name: 'Website (in use)' })
    await user.click(globe)
    await waitFor(() => expect(assigned()[`p1/${UUID}`]).toBe('preset:globe'))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })

  it('uploads an image, crops it to a square, and uses it', async () => {
    fakeServer([{ key: 'key-home', checks }])
    const { user } = startApp({ hash: `#/check/${UUID}/icon` })
    const input = await screen.findByLabelText('Upload an image')
    expect(input.getAttribute('accept')).toBe('image/*,.heic,.heif,.ico,.svg,.bmp,.avif,.webp')
    await user.upload(input as HTMLInputElement, new File(['x'], 'cat.png', { type: 'image/png' }))
    const box = await screen.findByRole('slider', { name: 'Crop area' })
    expect(screen.getByRole('img', { name: 'Uploaded image' }).tagName).toBe('CANVAS')
    expect(box.getAttribute('aria-valuetext')).toBe('300 pixels square') // the largest centred square
    await user.click(screen.getByRole('button', { name: 'Use this icon' }))
    expect(cropped).toEqual([{ x: 50, y: 0, size: 300 }])
    await waitFor(() => expect(assigned()[`p1/${UUID}`]).toMatch(/^custom:/))
    const custom = JSON.parse(localStorage.getItem('healthchecks-pocket.icons.custom')!)
    expect(Object.values(custom)).toEqual(['data:image/png;base64,ICON'])
  })

  it('Cancel on the cropper keeps the current icon', async () => {
    fakeServer([{ key: 'key-home', checks }])
    const { user } = startApp({ hash: `#/check/${UUID}/icon` })
    await user.upload(await screen.findByLabelText('Upload an image') as HTMLInputElement, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('slider')).toBeNull()
    expect(cropped).toEqual([])
  })

  it('says when an image type isn\'t supported (HEIC)', async () => {
    fakeServer([{ key: 'key-home', checks }])
    const { user } = startApp({ hash: `#/check/${UUID}/icon` })
    await user.upload(await screen.findByLabelText('Upload an image') as HTMLInputElement, new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' }))
    expect(text(await screen.findByRole('alert'))).toBe("This image type isn't supported here. Try a JPEG or PNG.")
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('deleting an uploaded icon asks first; checks using it get their default back', async () => {
    localStorage.setItem('healthchecks-pocket.icons.custom', JSON.stringify({ c1: 'data:image/png;base64,MINE' }))
    localStorage.setItem('healthchecks-pocket.icons.assigned', JSON.stringify({ [`p1/${UUID}`]: 'custom:c1' }))
    fakeServer([{ key: 'key-home', checks }])
    const asked = answerConfirms(false, true)
    const { user } = startApp({ hash: `#/check/${UUID}/icon` })
    await waitFor(() => expect(document.querySelector('.icon-current img')?.getAttribute('src')).toBe('data:image/png;base64,MINE'))
    await user.click(screen.getByRole('button', { name: 'Delete this icon' }))
    expect(asked[0]).toBe('Delete this icon? Checks using it go back to their default icon.')
    expect(JSON.parse(localStorage.getItem('healthchecks-pocket.icons.custom')!)).toHaveProperty('c1')

    fireEvent.click(screen.getByRole('button', { name: 'Delete this icon' }))
    await waitFor(() => expect(assigned()[`p1/${UUID}`]).toBe('preset:archive'))
    expect(JSON.parse(localStorage.getItem('healthchecks-pocket.icons.custom')!)).toEqual({})
    expect(tileColor(document.querySelector('.icon-current'))).toBeTruthy()
  })
})
