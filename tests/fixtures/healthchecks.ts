// Responses shaped exactly like the real healthchecks.io API v3 (field sets
// copied from live responses, values made up). Note flips: the server wraps
// them as {"flips": [...]}, although the docs show a bare array.

import type { Check, Flip, Ping } from '@/core/api/types';

export const NOW = Date.parse('2026-10-11T20:00:00Z');
const iso = (msBeforeNow: number) => new Date(NOW - msBeforeNow).toISOString();
const MINUTE = 60_000;

export const UUID = '11111111-2222-4333-8444-555555555555';

export const check: Check = {
  name: 'backup-server',
  tags: 'home nas',
  desc: 'Nightly backup heartbeat',
  grace: 3600,
  timeout: 3600,
  n_pings: 29,
  status: 'up',
  started: false,
  last_ping: iso(5 * MINUTE),
  next_ping: iso(-55 * MINUTE),
  manual_resume: false,
  uuid: UUID,
  ping_url: `https://hc-ping.com/${UUID}`,
};

/** The same check as a read-only key sees it: unique_key instead of uuid. */
export const readOnlyCheck: Check = (() => {
  const { uuid: _uuid, ping_url: _pingUrl, ...rest } = check;
  return { ...rest, unique_key: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' };
})();

export const pingsResponse: { pings: Ping[] } = {
  pings: [
    { type: 'success', date: iso(5 * MINUTE), n: 29, scheme: 'https', remote_addr: '203.0.113.9', method: 'POST', ua: 'curl/8.5.0', rid: null },
    { type: 'success', date: iso(65 * MINUTE), n: 28, scheme: 'https', remote_addr: '203.0.113.9', method: 'POST', ua: 'curl/8.5.0', rid: null },
    { type: 'fail', date: iso(125 * MINUTE), n: 27, scheme: 'https', remote_addr: '203.0.113.9', method: 'POST', ua: 'curl/8.5.0', rid: null },
  ],
};

export const flipsResponse: { flips: Flip[] } = {
  flips: [
    { timestamp: iso(120 * MINUTE), up: 1 },
    { timestamp: iso(125 * MINUTE), up: 0 },
    { timestamp: iso(3 * 1440 * MINUTE), up: 1 },
  ],
};

export const failBody = `FAIL (1 failing, 0 warnings)
[ERROR] backup: upload failed
[DEBUG] retrying (3/3)
level=warn disk almost full
INFO: done`;

/** Minimal fetch Response for mocks. */
export function respond(body: unknown, init: { status?: number; type?: 'json' | 'text' } = {}): Response {
  const status = init.status ?? 200;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(status === 204 ? null : text, {
    status,
    headers: { 'Content-Type': init.type === 'text' || typeof body === 'string' ? 'text/plain' : 'application/json' },
  });
}
