import { describe, expect, it } from 'vitest';
import { initialBox, MIN_CROP, moveBox, resizeBox, scaleBox } from '@/core/crop';
import { MORE_PRESETS } from '@/core/iconCatalog';
import { computeIconAssignmentKey, defaultIcon, forgetProject, iconsInUse, PRESETS, presetOf, presetRef, withDefaultIconsForNewChecks, type IconRef } from '@/core/icons';
import { searchPresets } from '@/core/iconSearch';
import { SEARCH_TERMS } from '@/core/iconSearchTerms';
import { check as base } from '../fixtures/healthchecks';
import type { Check } from '@/core/types';

const makeCheck = (name: string, tags = '', uuid = name): Check => ({ ...base, name, tags, uuid });

describe('presets', () => {
  it('has up to 1000 distinct icons, each with its own label and a colour', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(800);
    expect(PRESETS.length).toBeLessThanOrEqual(1000);
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((preset) => preset.label)).size).toBe(PRESETS.length); // told apart by a screen reader
    for (const preset of PRESETS) {
      expect(preset.label).toBeTruthy();
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('lists the hand-picked ones, each with keywords, before the rest of Lucide, which has none', () => {
    const handPicked = PRESETS.length - MORE_PRESETS.length;
    expect(handPicked).toBe(270);
    expect(PRESETS.slice(0, handPicked).every((preset) => preset.keywords.length > 0)).toBe(true);
    expect(PRESETS.slice(handPicked).map((preset) => preset.id)).toEqual(MORE_PRESETS.map((more) => more.id));
    expect(PRESETS.slice(handPicked).every((preset) => preset.keywords.length === 0)).toBe(true);
  });

  it('keeps the first 58 in their order, so checks without a matching word get the same defaults as before', () => {
    expect(PRESETS.slice(0, 4).map((preset) => preset.id)).toEqual(['server', 'database', 'hard-drive', 'archive']);
    expect(PRESETS[57].id).toBe('moon');
  });

  it('looks a preset up from its saved reference', () => {
    expect(presetOf('preset:archive')?.label).toBe('Backup');
    expect(presetOf('preset:cctv')?.label).toBe('CCTV');
    expect(presetOf('preset:nope')).toBeUndefined();
    expect(presetOf('custom:abc')).toBeUndefined();
  });
});

describe('preset search', () => {
  const ids = (query: string) => searchPresets(query).map((preset) => preset.id);

  it('finds an icon by the start of a word of its label, in any case', () => {
    expect(ids('CAMER')[0]).toBe('camera');
    expect(ids('cloud up')[0]).toBe('cloud-upload'); // every word typed must match
  });

  it('finds an icon by its keywords, its Lucide name and its Lucide tags', () => {
    expect(ids('postg')[0]).toBe('database'); // by a keyword, before Server, found by a search term only
    expect(ids('pihole')[0]).toBe('funnel');
    expect(ids('badge')).toContain('badge-check'); // labelled Certificate
    expect(ids('surveillance')).toContain('cctv'); // a Lucide tag
  });

  it('finds the names people search for, by the words typed or run together', () => {
    expect(ids('claude')).toEqual(expect.arrayContaining(['bot', 'brain', 'sparkles']));
    expect(ids('OpenAI')).toContain('bot');
    expect(ids('Home Assistant')).toContain('house'); // homeassistant
    expect(ids('Pi-hole')).toContain('funnel'); // pihole
    expect(ids('uptime kuma')).toContain('heart-pulse');
    expect(ids("Let's Encrypt")).toContain('badge-check');
    expect(ids('proxmox')).toContain('layers');
    expect(ids('restic')).toContain('archive');
    expect(ids('pagerduty')).toContain('siren');
  });

  it('has search terms only for icons it has, as single lowercase words', () => {
    const presetIds = new Set(PRESETS.map((preset) => preset.id));
    for (const [terms, iconIds] of SEARCH_TERMS) {
      expect(iconIds.filter((iconId) => !presetIds.has(iconId)), terms).toEqual([]);
      expect(terms.split(' ').filter((term) => !/^[a-z0-9]+$/.test(term)), terms).toEqual([]);
    }
  });

  it('lists icons found by their label first, then by their name or keywords, then by the rest', () => {
    // "Config file" by its label, before Logs (file-text), which comes earlier but matches only by name and keywords.
    const found = ids('file');
    expect(found.indexOf('file-cog')).toBeLessThan(found.indexOf('file-text'));
    expect(found.slice(0, found.indexOf('file-cog') + 1).every((id) => presetOf(presetRef(id))?.label.toLowerCase().includes('file'))).toBe(true);
  });

  it('finds every icon for an empty query, and none for a word nothing starts with', () => {
    expect(searchPresets('')).toBe(PRESETS);
    expect(searchPresets('  ')).toBe(PRESETS);
    expect(ids('xyzzy')).toEqual([]);
    expect(ids('amera')).toEqual([]); // the start of a word, not the middle
  });
});

describe('default icon', () => {
  it.each([
    ['nightly-backup', '', 'archive'], ['daily cron', '', 'clock'], ['home assistant backup', 'home', 'archive'], ['Disk canary', 'nas', 'hard-drive'], ['certificates', '', 'badge-check'],
    ['Front door camera', '', 'camera'], ['postgres dump', '', 'database'], ['example.com website', '', 'globe'],
    ['docker prune', '', 'container'], ['something', 'pi', 'cpu'],
    // Words only the newer icons know
    ['Weekly reboot', 'server', 'power'], ['mysqldump', '', 'database-backup'], ['pihole gravity', '', 'funnel'], ['RabbitMQ queue', '', 'rabbit'],
    // A word for where it is or which copy it is doesn't win over what the check does
    ['production backup', '', 'archive'], ['app deploy', '', 'rocket'], ['config backup', '', 'archive'], ['nginx config', '', 'server-cog'],
    ['Garage camera', '', 'camera'], ['kitchen lights', '', 'lightbulb'],
  ])('%s (%s) gets %s', (name, tags, id) => expect(defaultIcon(makeCheck(name, tags), new Set())).toBe(presetRef(id)));

  it('takes the next suggestion, then the first unused preset, when the suggested one is taken', () => {
    expect(defaultIcon(makeCheck('db backup'), new Set<IconRef>(['preset:database']))).toBe('preset:archive');
    expect(defaultIcon(makeCheck('xyzzy'), new Set())).toBe('preset:server');
    expect(defaultIcon(makeCheck('xyzzy'), new Set<IconRef>(['preset:server', 'preset:database']))).toBe('preset:hard-drive');
  });

  it('suggests from the name and tags only, not the slug healthchecks.io also sends', () => {
    const checkWithSlug = { ...makeCheck('xyzzy'), slug: 'nightly-backup' };
    expect(defaultIcon(checkWithSlug, new Set())).toBe('preset:server');
  });

  it('repeats only when every preset is taken', () => {
    const all = new Set(PRESETS.map((preset) => presetRef(preset.id)));
    expect(defaultIcon(makeCheck('backup'), all)).toBe('preset:archive');
    expect(defaultIcon(makeCheck('xyzzy'), all)).toBe('preset:server');
  });
});

describe('assignments', () => {
  const checks = [makeCheck('backup'), makeCheck('backup copy'), makeCheck('xyzzy')];

  it('gives every new check its own default, in list order, and keeps existing ones', () => {
    const savedIconsByCheck = withDefaultIconsForNewChecks({ 'p1/backup': 'preset:star' }, 'p1', checks);
    expect(savedIconsByCheck).toEqual({ 'p1/backup': 'preset:star', 'p1/backup copy': 'preset:archive', 'p1/xyzzy': 'preset:server' });
    expect(withDefaultIconsForNewChecks(savedIconsByCheck, 'p1', checks)).toBe(savedIconsByCheck); // nothing to add: same object
  });

  it('avoids repeats within a project only', () => {
    const savedIconsByCheck = withDefaultIconsForNewChecks({ 'p2/other': 'preset:archive' }, 'p1', [makeCheck('backup')]);
    expect(savedIconsByCheck['p1/backup']).toBe('preset:archive');
  });

  it('never removes an icon; one of a check that is gone no longer counts as used', () => {
    const before: Record<string, IconRef> = { 'p1/gone': 'preset:archive', 'p2/other': 'preset:moon' };
    expect(withDefaultIconsForNewChecks(before, 'p1', [makeCheck('backup')])).toEqual({ ...before, 'p1/backup': 'preset:archive' });
  });

  it('lists the icons in use in a project: only live checks when known, never the one being edited', () => {
    const savedIconsByCheck: Record<string, IconRef> = { 'p1/a': 'preset:star', 'p1/b': 'preset:moon', 'p1/gone': 'preset:sun', 'p2/c': 'preset:bug' };
    expect(iconsInUse(savedIconsByCheck, 'p1')).toEqual(new Set(['preset:star', 'preset:moon', 'preset:sun']));
    expect(iconsInUse(savedIconsByCheck, 'p1', new Set(['p1/a', 'p1/b']), 'p1/a')).toEqual(new Set(['preset:moon']));
  });

  it('forgets a removed project', () => {
    expect(forgetProject({ 'p1/a': 'preset:star', 'p2/b': 'preset:moon' }, 'p1')).toEqual({ 'p2/b': 'preset:moon' });
    expect(computeIconAssignmentKey('p1', makeCheck('x', '', 'uuid-1'))).toBe('p1/uuid-1');
  });
});

describe('crop box', () => {
  it('starts as the largest centred square', () => {
    expect(initialBox(400, 300)).toEqual({ x: 50, y: 0, size: 300 });
    expect(initialBox(200, 500)).toEqual({ x: 0, y: 150, size: 200 });
  });

  it('moves, but stays inside the image', () => {
    const box = { x: 50, y: 50, size: 100 };
    expect(moveBox(box, 20, -10, 400, 300)).toEqual({ x: 70, y: 40, size: 100 });
    expect(moveBox(box, -999, 999, 400, 300)).toEqual({ x: 0, y: 200, size: 100 });
  });

  it('resizes from its corner, staying square, inside, and not too small', () => {
    const box = { x: 50, y: 50, size: 100 };
    expect(resizeBox(box, 30, 400, 300)).toEqual({ x: 50, y: 50, size: 130 });
    expect(resizeBox(box, 999, 400, 300)).toEqual({ x: 50, y: 50, size: 250 }); // up to the bottom edge
    expect(resizeBox(box, -999, 400, 300).size).toBe(MIN_CROP);
    expect(resizeBox({ x: 0, y: 0, size: 10 }, -5, 10, 10).size).toBe(10); // tiny image: the whole image
  });

  it('pinch-scales around its centre, inside the image', () => {
    expect(scaleBox({ x: 100, y: 100, size: 100 }, 0.5, 400, 300)).toEqual({ x: 125, y: 125, size: 50 });
    expect(scaleBox({ x: 100, y: 100, size: 100 }, 10, 400, 300)).toEqual({ x: 0, y: 0, size: 300 }); // centre kept where it fits
  });
});
