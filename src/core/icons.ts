// Job icons: a preset (Lucide glyph on a coloured tile) or an image the user
// uploaded and cropped. Icons are this app's own (Healthchecks has no icon
// field), kept as settings so they move to a new phone with the rest.

import type { Check } from './types'
import { checkId } from './types'

export type IconRef = `preset:${string}` | `custom:${string}`

export interface Preset {
  id: string // stable: saved in settings
  label: string
  color: string // tile colour, white glyph on top (works in light and dark)
  keywords: string[] // matched against a check's name, slug and tags
}

const C = {
  blue: '#2f6fde', indigo: '#5b5bd6', violet: '#7c4ddb', pink: '#d6409f', red: '#d93636', orange: '#e0661b',
  amber: '#c27c0e', green: '#1f9d55', emerald: '#0e8a6a', teal: '#0f8a8a', cyan: '#0b7fb3', slate: '#56627a',
}

/** In fallback order: a new check without a keyword match gets the first one
 *  not used yet in its project. */
export const PRESETS: Preset[] = [
  { id: 'server', label: 'Server', color: C.blue, keywords: ['server', 'host', 'vps', 'node', 'machine'] },
  { id: 'database', label: 'Database', color: C.violet, keywords: ['db', 'database', 'sql', 'postgres', 'mysql', 'mariadb', 'redis', 'mongo', 'sqlite'] },
  { id: 'hard-drive', label: 'Disk', color: C.slate, keywords: ['disk', 'drive', 'nas', 'storage', 'raid', 'zfs', 'smart', 'partition'] },
  { id: 'archive', label: 'Backup', color: C.amber, keywords: ['backup', 'backups', 'archive', 'snapshot', 'restic', 'borg', 'rsync'] },
  { id: 'cloud', label: 'Cloud', color: C.cyan, keywords: ['cloud', 'aws', 's3', 'gcp', 'azure'] },
  { id: 'cloud-upload', label: 'Upload to cloud', color: C.teal, keywords: ['offsite', 'b2', 'rclone'] },
  { id: 'globe', label: 'Website', color: C.green, keywords: ['web', 'website', 'site', 'http', 'https', 'url', 'blog', 'www'] },
  { id: 'network', label: 'Network', color: C.indigo, keywords: ['network', 'dns', 'vpn', 'tailscale', 'wireguard', 'lan'] },
  { id: 'router', label: 'Router', color: C.slate, keywords: ['router', 'gateway', 'firewall', 'opnsense', 'pfsense'] },
  { id: 'wifi', label: 'Wi-Fi', color: C.blue, keywords: ['wifi', 'wireless', 'ap'] },
  { id: 'shield', label: 'Security', color: C.emerald, keywords: ['security', 'scan', 'antivirus', 'audit', 'fail2ban'] },
  { id: 'badge-check', label: 'Certificate', color: C.green, keywords: ['cert', 'certs', 'certificate', 'certificates', 'ssl', 'tls', 'letsencrypt', 'acme'] },
  { id: 'lock', label: 'Lock', color: C.slate, keywords: ['lock', 'vault', 'password', 'secrets'] },
  { id: 'key', label: 'Key', color: C.amber, keywords: ['key', 'keys', 'token', 'auth', 'login'] },
  { id: 'mail', label: 'Mail', color: C.red, keywords: ['mail', 'email', 'smtp', 'imap', 'newsletter'] },
  { id: 'bell', label: 'Notification', color: C.orange, keywords: ['alert', 'notify', 'notification', 'reminder'] },
  { id: 'clock', label: 'Cron', color: C.indigo, keywords: ['cron', 'schedule', 'scheduled', 'hourly', 'nightly', 'daily'] },
  { id: 'calendar', label: 'Calendar', color: C.red, keywords: ['calendar', 'weekly', 'monthly', 'report'] },
  { id: 'timer', label: 'Timer', color: C.cyan, keywords: ['timer', 'timeout', 'uptime'] },
  { id: 'cpu', label: 'Board', color: C.green, keywords: ['pi', 'raspberry', 'rpi', 'cpu', 'arduino', 'esp32', 'board'] },
  { id: 'memory-stick', label: 'Memory', color: C.violet, keywords: ['memory', 'ram', 'swap'] },
  { id: 'thermometer', label: 'Temperature', color: C.orange, keywords: ['temp', 'temperature', 'sensor', 'heat', 'thermostat'] },
  { id: 'plug', label: 'Power', color: C.amber, keywords: ['power', 'ups', 'plug', 'outlet'] },
  { id: 'battery', label: 'Battery', color: C.green, keywords: ['battery'] },
  { id: 'sun', label: 'Solar', color: C.amber, keywords: ['solar', 'sun', 'weather'] },
  { id: 'house', label: 'Home', color: C.blue, keywords: ['home', 'house', 'homeassistant', 'hass'] },
  { id: 'container', label: 'Container', color: C.cyan, keywords: ['docker', 'container', 'containers', 'k8s', 'kubernetes', 'podman', 'compose'] },
  { id: 'box', label: 'Package', color: C.amber, keywords: ['package', 'packages', 'apt', 'update', 'updates', 'upgrade'] },
  { id: 'git-branch', label: 'Git', color: C.orange, keywords: ['git', 'github', 'gitlab', 'repo', 'mirror'] },
  { id: 'code', label: 'Code', color: C.indigo, keywords: ['code', 'build', 'ci', 'test', 'tests'] },
  { id: 'terminal', label: 'Script', color: C.slate, keywords: ['script', 'shell', 'bash', 'job', 'task', 'cleanup'] },
  { id: 'bug', label: 'Bug', color: C.red, keywords: ['bug', 'error', 'errors', 'debug'] },
  { id: 'rocket', label: 'Deploy', color: C.pink, keywords: ['deploy', 'release', 'launch'] },
  { id: 'refresh-cw', label: 'Sync', color: C.teal, keywords: ['sync', 'refresh', 'replicate', 'replication'] },
  { id: 'download', label: 'Download', color: C.blue, keywords: ['download', 'fetch', 'import', 'pull'] },
  { id: 'upload', label: 'Upload', color: C.green, keywords: ['upload', 'export', 'push'] },
  { id: 'file-text', label: 'Logs', color: C.slate, keywords: ['log', 'logs', 'logrotate', 'file', 'files'] },
  { id: 'folder', label: 'Folder', color: C.amber, keywords: ['folder', 'share', 'samba', 'smb', 'nfs'] },
  { id: 'link', label: 'Link', color: C.cyan, keywords: ['link', 'links', 'ping', 'heartbeat', 'canary'] },
  { id: 'smartphone', label: 'Phone', color: C.violet, keywords: ['phone', 'mobile', 'android', 'ios', 'sms'] },
  { id: 'printer', label: 'Printer', color: C.slate, keywords: ['printer', 'print', 'scanner'] },
  { id: 'tv', label: 'Media', color: C.indigo, keywords: ['tv', 'media', 'plex', 'jellyfin', 'emby', 'video'] },
  { id: 'camera', label: 'Camera', color: C.red, keywords: ['camera', 'cam', 'cctv', 'nvr', 'frigate', 'tapo', 'photo', 'photos'] },
  { id: 'music', label: 'Music', color: C.pink, keywords: ['music', 'audio', 'spotify', 'sonos', 'podcast'] },
  { id: 'gamepad-2', label: 'Games', color: C.violet, keywords: ['game', 'games', 'minecraft', 'steam'] },
  { id: 'car', label: 'Car', color: C.blue, keywords: ['car', 'vehicle', 'ev', 'charger'] },
  { id: 'leaf', label: 'Garden', color: C.green, keywords: ['garden', 'plant', 'plants', 'leaf'] },
  { id: 'droplet', label: 'Water', color: C.cyan, keywords: ['water', 'irrigation', 'leak', 'pump'] },
  { id: 'heart-pulse', label: 'Health', color: C.red, keywords: ['health', 'healthcheck', 'status', 'monitor'] },
  { id: 'users', label: 'Users', color: C.teal, keywords: ['user', 'users', 'accounts', 'ldap', 'team'] },
  { id: 'shopping-cart', label: 'Shop', color: C.orange, keywords: ['shop', 'store', 'cart', 'orders', 'ecommerce'] },
  { id: 'credit-card', label: 'Payments', color: C.emerald, keywords: ['payment', 'payments', 'billing', 'invoice', 'stripe'] },
  { id: 'coffee', label: 'Coffee', color: C.amber, keywords: ['coffee', 'break'] },
  { id: 'book', label: 'Docs', color: C.indigo, keywords: ['docs', 'wiki', 'book', 'documentation'] },
  { id: 'flag', label: 'Flag', color: C.red, keywords: ['flag', 'milestone'] },
  { id: 'star', label: 'Star', color: C.amber, keywords: ['star', 'favorite', 'important'] },
  { id: 'zap', label: 'Fast', color: C.orange, keywords: ['fast', 'speed', 'speedtest', 'bandwidth', 'electric'] },
  { id: 'moon', label: 'Night', color: C.violet, keywords: ['night', 'sleep', 'midnight'] },
]

const byId = new Map(PRESETS.map((p) => [p.id, p]))
export const presetRef = (id: string): IconRef => `preset:${id}`
export function presetOf(ref: IconRef | undefined): Preset | undefined {
  return ref?.startsWith('preset:') ? byId.get(ref.slice(7)) : undefined
}

/** Keywords that say little about what a check is: used only when nothing
 *  more specific matches. */
const WEAK = new Set([
  'nightly', 'daily', 'hourly', 'weekly', 'monthly', 'schedule', 'scheduled', 'cron', 'job', 'task', 'status',
  'monitor', 'node', 'test', 'tests', 'file', 'files', 'report', 'ping', 'update', 'updates', 'home',
])

function words(check: Check): string[] {
  return `${check.name} ${check.slug} ${check.tags}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** A new check's icon: one its name or tags suggest (a "backup" check gets
 *  the backup icon), unless that's already used in the project; then the
 *  first preset not used yet. Duplicates only once every preset is taken. */
export function defaultIcon(check: Check, used: Set<IconRef>): IconRef {
  const suggested: Preset[] = []
  const ws = words(check)
  // Specific words first: "nightly backup" is a backup, not a clock.
  for (const w of [...ws.filter((w) => !WEAK.has(w)), ...ws.filter((w) => WEAK.has(w))]) {
    const p = PRESETS.find((p) => p.keywords.includes(w))
    if (p && !suggested.includes(p)) suggested.push(p)
  }
  const fresh = [...suggested, ...PRESETS].find((p) => !used.has(presetRef(p.id)))
  return presetRef((fresh ?? suggested[0] ?? PRESETS[0]).id)
}

export type Assignments = Record<string, IconRef> // "<projectId>/<checkId>"

export const assignmentKey = (projectId: string, check: Check | string) =>
  `${projectId}/${typeof check === 'string' ? check : checkId(check)}`

/** Give every check without an icon its default (in list order, so they
 *  don't repeat), and, with `prune`, drop icons of this project's checks that
 *  no longer exist. Returns the same object when nothing changed. */
export function withDefaults(assigned: Assignments, projectId: string, checks: Check[], prune = false): Assignments {
  const prefix = `${projectId}/`
  const next = { ...assigned }
  let changed = false
  if (prune) {
    const live = new Set(checks.map((c) => assignmentKey(projectId, c)))
    for (const k of Object.keys(next)) {
      if (k.startsWith(prefix) && !live.has(k)) {
        delete next[k]
        changed = true
      }
    }
  }
  for (const c of checks) {
    const k = assignmentKey(projectId, c)
    if (next[k]) continue
    const used = new Set(Object.entries(next).filter(([key]) => key.startsWith(prefix)).map(([, ref]) => ref))
    next[k] = defaultIcon(c, used)
    changed = true
  }
  return changed ? next : assigned
}

/** Icons of one project's checks, without the removed project's leftovers. */
export function forgetProject(assigned: Assignments, projectId: string): Assignments {
  return Object.fromEntries(Object.entries(assigned).filter(([k]) => !k.startsWith(`${projectId}/`)))
}
