// Check icons: a preset (Lucide glyph on a coloured tile) or an image the user
// uploaded and cropped. Icons are this app's own (Healthchecks has no icon
// field), kept as settings so they move to a new phone with the rest.

import type { Check } from './types';
import { checkId } from './types';

export type IconRef = `preset:${string}` | `custom:${string}`;

export interface Preset {
  id: string; // stable: saved in settings
  label: string;
  color: string; // tile colour, white glyph on top (works in light and dark)
  keywords: string[]; // matched against a check's name, slug and tags
}

const COLORS = {
  blue: '#2f6fde', indigo: '#5b5bd6', violet: '#7c4ddb', pink: '#d6409f', red: '#d93636', orange: '#e0661b',
  amber: '#c27c0e', green: '#1f9d55', emerald: '#0e8a6a', teal: '#0f8a8a', cyan: '#0b7fb3', slate: '#56627a',
};

/** In fallback order: a new check without a keyword match gets the first one
 *  not used yet in its project. */
export const PRESETS: Preset[] = [
  { id: 'server', label: 'Server', color: COLORS.blue, keywords: ['server', 'host', 'vps', 'node', 'machine'] },
  { id: 'database', label: 'Database', color: COLORS.violet, keywords: ['db', 'database', 'sql', 'postgres', 'mysql', 'mariadb', 'redis', 'mongo', 'sqlite'] },
  { id: 'hard-drive', label: 'Disk', color: COLORS.slate, keywords: ['disk', 'drive', 'nas', 'storage', 'raid', 'zfs', 'smart', 'partition'] },
  { id: 'archive', label: 'Backup', color: COLORS.amber, keywords: ['backup', 'backups', 'archive', 'snapshot', 'restic', 'borg', 'rsync'] },
  { id: 'cloud', label: 'Cloud', color: COLORS.cyan, keywords: ['cloud', 'aws', 's3', 'gcp', 'azure'] },
  { id: 'cloud-upload', label: 'Upload to cloud', color: COLORS.teal, keywords: ['offsite', 'b2', 'rclone'] },
  { id: 'globe', label: 'Website', color: COLORS.green, keywords: ['web', 'website', 'site', 'http', 'https', 'url', 'blog', 'www'] },
  { id: 'network', label: 'Network', color: COLORS.indigo, keywords: ['network', 'dns', 'vpn', 'tailscale', 'wireguard', 'lan'] },
  { id: 'router', label: 'Router', color: COLORS.slate, keywords: ['router', 'gateway', 'firewall', 'opnsense', 'pfsense'] },
  { id: 'wifi', label: 'Wi-Fi', color: COLORS.blue, keywords: ['wifi', 'wireless', 'ap'] },
  { id: 'shield', label: 'Security', color: COLORS.emerald, keywords: ['security', 'scan', 'antivirus', 'audit', 'fail2ban'] },
  { id: 'badge-check', label: 'Certificate', color: COLORS.green, keywords: ['cert', 'certs', 'certificate', 'certificates', 'ssl', 'tls', 'letsencrypt', 'acme'] },
  { id: 'lock', label: 'Lock', color: COLORS.slate, keywords: ['lock', 'vault', 'password', 'secrets'] },
  { id: 'key', label: 'Key', color: COLORS.amber, keywords: ['key', 'keys', 'token', 'auth', 'login'] },
  { id: 'mail', label: 'Mail', color: COLORS.red, keywords: ['mail', 'email', 'smtp', 'imap', 'newsletter'] },
  { id: 'bell', label: 'Notification', color: COLORS.orange, keywords: ['alert', 'notify', 'notification', 'reminder'] },
  { id: 'clock', label: 'Cron', color: COLORS.indigo, keywords: ['cron', 'schedule', 'scheduled', 'hourly', 'nightly', 'daily'] },
  { id: 'calendar', label: 'Calendar', color: COLORS.red, keywords: ['calendar', 'weekly', 'monthly', 'report'] },
  { id: 'timer', label: 'Timer', color: COLORS.cyan, keywords: ['timer', 'timeout', 'uptime'] },
  { id: 'cpu', label: 'Board', color: COLORS.green, keywords: ['pi', 'raspberry', 'rpi', 'cpu', 'arduino', 'esp32', 'board'] },
  { id: 'memory-stick', label: 'Memory', color: COLORS.violet, keywords: ['memory', 'ram', 'swap'] },
  { id: 'thermometer', label: 'Temperature', color: COLORS.orange, keywords: ['temp', 'temperature', 'sensor', 'heat', 'thermostat'] },
  { id: 'plug', label: 'Power', color: COLORS.amber, keywords: ['power', 'ups', 'plug', 'outlet'] },
  { id: 'battery', label: 'Battery', color: COLORS.green, keywords: ['battery'] },
  { id: 'sun', label: 'Solar', color: COLORS.amber, keywords: ['solar', 'sun', 'weather'] },
  { id: 'house', label: 'Home', color: COLORS.blue, keywords: ['home', 'house', 'homeassistant', 'hass'] },
  { id: 'container', label: 'Container', color: COLORS.cyan, keywords: ['docker', 'container', 'containers', 'k8s', 'kubernetes', 'podman', 'compose'] },
  { id: 'box', label: 'Package', color: COLORS.amber, keywords: ['package', 'packages', 'apt', 'update', 'updates', 'upgrade'] },
  { id: 'git-branch', label: 'Git', color: COLORS.orange, keywords: ['git', 'github', 'gitlab', 'repo', 'mirror'] },
  { id: 'code', label: 'Code', color: COLORS.indigo, keywords: ['code', 'build', 'ci', 'test', 'tests'] },
  { id: 'terminal', label: 'Script', color: COLORS.slate, keywords: ['script', 'shell', 'bash', 'job', 'task', 'cleanup'] },
  { id: 'bug', label: 'Bug', color: COLORS.red, keywords: ['bug', 'error', 'errors', 'debug'] },
  { id: 'rocket', label: 'Deploy', color: COLORS.pink, keywords: ['deploy', 'release', 'launch'] },
  { id: 'refresh-cw', label: 'Sync', color: COLORS.teal, keywords: ['sync', 'refresh', 'replicate', 'replication'] },
  { id: 'download', label: 'Download', color: COLORS.blue, keywords: ['download', 'fetch', 'import', 'pull'] },
  { id: 'upload', label: 'Upload', color: COLORS.green, keywords: ['upload', 'export', 'push'] },
  { id: 'file-text', label: 'Logs', color: COLORS.slate, keywords: ['log', 'logs', 'logrotate', 'file', 'files'] },
  { id: 'folder', label: 'Folder', color: COLORS.amber, keywords: ['folder', 'share', 'samba', 'smb', 'nfs'] },
  { id: 'link', label: 'Link', color: COLORS.cyan, keywords: ['link', 'links', 'ping', 'heartbeat', 'canary'] },
  { id: 'smartphone', label: 'Phone', color: COLORS.violet, keywords: ['phone', 'mobile', 'android', 'ios', 'sms'] },
  { id: 'printer', label: 'Printer', color: COLORS.slate, keywords: ['printer', 'print', 'scanner'] },
  { id: 'tv', label: 'Media', color: COLORS.indigo, keywords: ['tv', 'media', 'plex', 'jellyfin', 'emby', 'video'] },
  { id: 'camera', label: 'Camera', color: COLORS.red, keywords: ['camera', 'cam', 'cctv', 'nvr', 'frigate', 'tapo', 'photo', 'photos'] },
  { id: 'music', label: 'Music', color: COLORS.pink, keywords: ['music', 'audio', 'spotify', 'sonos', 'podcast'] },
  { id: 'gamepad-2', label: 'Games', color: COLORS.violet, keywords: ['game', 'games', 'minecraft', 'steam'] },
  { id: 'car', label: 'Car', color: COLORS.blue, keywords: ['car', 'vehicle', 'ev', 'charger'] },
  { id: 'leaf', label: 'Garden', color: COLORS.green, keywords: ['garden', 'plant', 'plants', 'leaf'] },
  { id: 'droplet', label: 'Water', color: COLORS.cyan, keywords: ['water', 'irrigation', 'leak', 'pump'] },
  { id: 'heart-pulse', label: 'Health', color: COLORS.red, keywords: ['health', 'healthcheck', 'status', 'monitor'] },
  { id: 'users', label: 'Users', color: COLORS.teal, keywords: ['user', 'users', 'accounts', 'ldap', 'team'] },
  { id: 'shopping-cart', label: 'Shop', color: COLORS.orange, keywords: ['shop', 'store', 'cart', 'orders', 'ecommerce'] },
  { id: 'credit-card', label: 'Payments', color: COLORS.emerald, keywords: ['payment', 'payments', 'billing', 'invoice', 'stripe'] },
  { id: 'coffee', label: 'Coffee', color: COLORS.amber, keywords: ['coffee', 'break'] },
  { id: 'book', label: 'Docs', color: COLORS.indigo, keywords: ['docs', 'wiki', 'book', 'documentation'] },
  { id: 'flag', label: 'Flag', color: COLORS.red, keywords: ['flag', 'milestone'] },
  { id: 'star', label: 'Star', color: COLORS.amber, keywords: ['star', 'favorite', 'important'] },
  { id: 'zap', label: 'Fast', color: COLORS.orange, keywords: ['fast', 'speed', 'speedtest', 'bandwidth', 'electric'] },
  { id: 'moon', label: 'Night', color: COLORS.violet, keywords: ['night', 'sleep', 'midnight'] },
];

const byId = new Map(PRESETS.map((preset) => [preset.id, preset]));
export const presetRef = (id: string): IconRef => `preset:${id}`;
export function presetOf(ref: IconRef | undefined): Preset | undefined {
  return ref?.startsWith('preset:') ? byId.get(ref.slice(7)) : undefined;
}

/** Keywords that say little about what a check is: used only when nothing
 *  more specific matches. */
const WEAK = new Set([
  'nightly', 'daily', 'hourly', 'weekly', 'monthly', 'schedule', 'scheduled', 'cron', 'job', 'task', 'status',
  'monitor', 'node', 'test', 'tests', 'file', 'files', 'report', 'ping', 'update', 'updates', 'home',
]);

function words(check: Check): string[] {
  return `${check.name} ${check.slug} ${check.tags}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** A new check's icon: one its name or tags suggest (a "backup" check gets
 *  the backup icon), unless that's already used in the project; then the
 *  first preset not used yet. Duplicates only once every preset is taken. */
export function defaultIcon(check: Check, used: Set<IconRef>): IconRef {
  const suggested: Preset[] = [];
  const checkWords = words(check);
  // Specific words first: "nightly backup" is a backup, not a clock.
  for (const word of [...checkWords.filter((word) => !WEAK.has(word)), ...checkWords.filter((word) => WEAK.has(word))]) {
    const match = PRESETS.find((preset) => preset.keywords.includes(word));
    if (match && !suggested.includes(match)) suggested.push(match);
  }
  const fresh = [...suggested, ...PRESETS].find((preset) => !used.has(presetRef(preset.id)));
  return presetRef((fresh ?? suggested[0] ?? PRESETS[0]).id);
}

export type SavedCheckIcons = Record<string, IconRef>; // "<projectId>/<checkId>"

export const computeIconAssignmentKey = (projectId: string, check: Check | string) =>
  `${projectId}/${typeof check === 'string' ? check : checkId(check)}`;

/** Icons taken in a project, ignoring `exceptIconAssignmentKey`; with `liveIconAssignmentKeys`, only current checks count. */
export function iconsInUse(savedIconsByCheck: SavedCheckIcons, projectId: string, liveIconAssignmentKeys?: Set<string>, exceptIconAssignmentKey?: string): Set<IconRef> {
  const projectPrefix = `${projectId}/`;
  const iconsTaken = new Set<IconRef>();
  for (const [iconAssignmentKey, savedIcon] of Object.entries(savedIconsByCheck)) {
    // Another project's check
    if (!iconAssignmentKey.startsWith(projectPrefix)) continue;
    // The check being edited / should not update
    if (iconAssignmentKey === exceptIconAssignmentKey) continue;
    // Not in the project's latest list (deleted on healthchecks.io)
    if (liveIconAssignmentKeys && !liveIconAssignmentKeys.has(iconAssignmentKey)) continue;
    iconsTaken.add(savedIcon);
  }
  return iconsTaken;
}

/** Give checks without an icon their default, in list order and without repeats. Only adds, never changes or removes; same object if nothing added. */
export function withDefaultIconsForNewChecks(savedIconsByCheck: SavedCheckIcons, projectId: string, checks: Check[]): SavedCheckIcons {
  // Checks without an icon yet. None: return the same object, so nothing is re-saved.
  const checksWithAssignmentKeys = checks.map((check) => ({ check, iconAssignmentKey: computeIconAssignmentKey(projectId, check) }));
  const checksWithoutIcon = checksWithAssignmentKeys.filter(({ iconAssignmentKey }) => !savedIconsByCheck[iconAssignmentKey]);
  if (checksWithoutIcon.length === 0) return savedIconsByCheck;

  // Icons taken by the project's current checks.
  const liveIconAssignmentKeys = new Set(checksWithAssignmentKeys.map(({ iconAssignmentKey }) => iconAssignmentKey));
  const iconsTaken = iconsInUse(savedIconsByCheck, projectId, liveIconAssignmentKeys);

  // Defaults in list order, each marked taken so the next check picks another.
  const savedIconsWithNewChecks = { ...savedIconsByCheck };
  for (const { check, iconAssignmentKey } of checksWithoutIcon) {
    const newIcon = defaultIcon(check, iconsTaken);
    iconsTaken.add(newIcon);
    savedIconsWithNewChecks[iconAssignmentKey] = newIcon;
  }
  return savedIconsWithNewChecks;
}

/** Icons of one project's checks, without the removed project's leftovers. */
export function forgetProject(savedIconsByCheck: SavedCheckIcons, projectId: string): SavedCheckIcons {
  return Object.fromEntries(Object.entries(savedIconsByCheck).filter(([iconAssignmentKey]) => !iconAssignmentKey.startsWith(`${projectId}/`)));
}
