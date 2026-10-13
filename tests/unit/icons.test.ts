import { describe, expect, it } from 'vitest'
import { initialBox, MIN_CROP, moveBox, resizeBox, scaleBox } from '../../src/core/crop'
import { assignmentKey, defaultIcon, forgetProject, PRESETS, presetOf, presetRef, withDefaults, type IconRef } from '../../src/core/icons'
import { check as base } from '../fixtures/healthchecks'
import type { Check } from '../../src/core/types'

const mk = (name: string, tags = '', uuid = name): Check => ({ ...base, name, slug: name.toLowerCase().replace(/\W+/g, '-'), tags, uuid })

describe('presets', () => {
  it('has about 50 distinct icons, each with a label, a colour and keywords', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(50)
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    for (const p of PRESETS) {
      expect(p.label).toBeTruthy()
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('looks a preset up from its saved reference', () => {
    expect(presetOf('preset:archive')?.label).toBe('Backup')
    expect(presetOf('preset:nope')).toBeUndefined()
    expect(presetOf('custom:abc')).toBeUndefined()
  })
})

describe('default icon', () => {
  it.each([
    ['nightly-backup', '', 'archive'], ['daily cron', '', 'clock'], ['home assistant backup', 'home', 'archive'], ['Disk canary', 'nas', 'hard-drive'], ['certificates', '', 'badge-check'],
    ['Front door camera', '', 'camera'], ['postgres dump', '', 'database'], ['example.com website', '', 'globe'],
    ['docker prune', '', 'container'], ['something', 'pi', 'cpu'],
  ])('%s (%s) gets %s', (name, tags, id) => expect(defaultIcon(mk(name, tags), new Set())).toBe(presetRef(id)))

  it('takes the next suggestion, then the first unused preset, when the suggested one is taken', () => {
    expect(defaultIcon(mk('db backup'), new Set<IconRef>(['preset:database']))).toBe('preset:archive')
    expect(defaultIcon(mk('xyzzy'), new Set())).toBe('preset:server')
    expect(defaultIcon(mk('xyzzy'), new Set<IconRef>(['preset:server', 'preset:database']))).toBe('preset:hard-drive')
  })

  it('repeats only when every preset is taken', () => {
    const all = new Set(PRESETS.map((p) => presetRef(p.id)))
    expect(defaultIcon(mk('backup'), all)).toBe('preset:archive')
    expect(defaultIcon(mk('xyzzy'), all)).toBe('preset:server')
  })
})

describe('assignments', () => {
  const checks = [mk('backup'), mk('backup copy'), mk('xyzzy')]

  it('gives every new check its own default, in list order, and keeps existing ones', () => {
    const a = withDefaults({ 'p1/backup': 'preset:star' }, 'p1', checks)
    expect(a).toEqual({ 'p1/backup': 'preset:star', 'p1/backup copy': 'preset:archive', 'p1/xyzzy': 'preset:server' })
    expect(withDefaults(a, 'p1', checks)).toBe(a) // nothing to add: same object
  })

  it('avoids repeats within a project only', () => {
    const a = withDefaults({ 'p2/other': 'preset:archive' }, 'p1', [mk('backup')])
    expect(a['p1/backup']).toBe('preset:archive')
  })

  it('prunes icons of checks that no longer exist, only in that project, and only when asked', () => {
    const before = { 'p1/gone': 'preset:star', 'p1/backup': 'preset:archive', 'p2/gone': 'preset:moon' } as const
    expect(withDefaults(before, 'p1', [mk('backup')])).toBe(before)
    expect(withDefaults(before, 'p1', [mk('backup')], true)).toEqual({ 'p1/backup': 'preset:archive', 'p2/gone': 'preset:moon' })
  })

  it('forgets a removed project', () => {
    expect(forgetProject({ 'p1/a': 'preset:star', 'p2/b': 'preset:moon' }, 'p1')).toEqual({ 'p2/b': 'preset:moon' })
    expect(assignmentKey('p1', mk('x', '', 'uuid-1'))).toBe('p1/uuid-1')
  })
})

describe('crop box', () => {
  it('starts as the largest centred square', () => {
    expect(initialBox(400, 300)).toEqual({ x: 50, y: 0, size: 300 })
    expect(initialBox(200, 500)).toEqual({ x: 0, y: 150, size: 200 })
  })

  it('moves, but stays inside the image', () => {
    const b = { x: 50, y: 50, size: 100 }
    expect(moveBox(b, 20, -10, 400, 300)).toEqual({ x: 70, y: 40, size: 100 })
    expect(moveBox(b, -999, 999, 400, 300)).toEqual({ x: 0, y: 200, size: 100 })
  })

  it('resizes from its corner, staying square, inside, and not too small', () => {
    const b = { x: 50, y: 50, size: 100 }
    expect(resizeBox(b, 30, 400, 300)).toEqual({ x: 50, y: 50, size: 130 })
    expect(resizeBox(b, 999, 400, 300)).toEqual({ x: 50, y: 50, size: 250 }) // up to the bottom edge
    expect(resizeBox(b, -999, 400, 300).size).toBe(MIN_CROP)
    expect(resizeBox({ x: 0, y: 0, size: 10 }, -5, 10, 10).size).toBe(10) // tiny image: the whole image
  })

  it('pinch-scales around its centre, inside the image', () => {
    expect(scaleBox({ x: 100, y: 100, size: 100 }, 0.5, 400, 300)).toEqual({ x: 125, y: 125, size: 50 })
    expect(scaleBox({ x: 100, y: 100, size: 100 }, 10, 400, 300)).toEqual({ x: 0, y: 0, size: 300 }) // centre kept where it fits
  })
})
