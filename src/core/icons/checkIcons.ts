// Check icons: a preset (Lucide glyph on a coloured tile) or an image the user
// uploaded and cropped. Icons are this app's own (Healthchecks has no icon
// field), kept as settings so they move to a new phone with the rest.

import { MORE_PRESETS } from './catalog/iconCatalog';
import type { HealthchecksApi } from '@/core/api/client';
import type { Check } from '@/core/api/types';
import { checkIdOf } from '@/core/api/types';

export type IconRef = `preset:${string}` | `custom:${string}`;

export interface Preset {
  id: string; // stable: saved in settings
  label: string;
  color: string; // tile colour, white glyph on top (works in light and dark)
  keywords: string[]; // matched against a check's name and tags
}

const COLORS = {
  blue: '#2f6fde', indigo: '#5b5bd6', violet: '#7c4ddb', pink: '#d6409f', red: '#d93636', orange: '#e0661b',
  amber: '#c27c0e', green: '#1f9d55', emerald: '#0e8a6a', teal: '#0f8a8a', cyan: '#0b7fb3', slate: '#56627a',
};
export type ColorName = keyof typeof COLORS;

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
  // Added after the first 58, so a check without a matching word gets the same default as before.
  // Machines and networks
  { id: 'server-cog', label: 'Server config', color: COLORS.slate, keywords: ['config', 'provision', 'provisioning', 'ansible', 'puppet', 'chef', 'terraform'] },
  { id: 'server-crash', label: 'Outage', color: COLORS.red, keywords: ['outage', 'outages', 'crash', 'down', 'downtime', 'incident'] },
  { id: 'database-backup', label: 'Database backup', color: COLORS.violet, keywords: ['dump', 'pgdump', 'mysqldump', 'mongodump'] },
  { id: 'cloud-download', label: 'Restore', color: COLORS.cyan, keywords: ['restore', 'restores', 'restoring'] },
  { id: 'cloud-off', label: 'Offline', color: COLORS.slate, keywords: ['offline', 'disconnected', 'unreachable'] },
  { id: 'layers', label: 'Stack', color: COLORS.indigo, keywords: ['stack', 'stacks', 'proxmox', 'vm', 'vms', 'virtual', 'hypervisor', 'esxi'] },
  { id: 'boxes', label: 'Cluster', color: COLORS.cyan, keywords: ['cluster', 'clusters', 'swarm', 'nomad', 'pod', 'pods'] },
  { id: 'ship-wheel', label: 'Helm', color: COLORS.blue, keywords: ['helm', 'charts', 'argo', 'argocd', 'flux', 'gitops'] },
  { id: 'anchor', label: 'Registry', color: COLORS.indigo, keywords: ['registry', 'harbor', 'dock'] },
  { id: 'gpu', label: 'GPU', color: COLORS.green, keywords: ['gpu', 'gpus', 'nvidia', 'cuda', 'graphics'] },
  { id: 'microchip', label: 'Chip', color: COLORS.slate, keywords: ['chip', 'firmware', 'embedded', 'bios', 'microcontroller'] },
  { id: 'circuit-board', label: 'Circuit', color: COLORS.emerald, keywords: ['circuit', 'pcb', 'electronics', 'iot', 'esphome'] },
  { id: 'binary', label: 'Binary', color: COLORS.slate, keywords: ['binary', 'binaries', 'bits', 'bytes'] },
  { id: 'monitor', label: 'Desktop', color: COLORS.blue, keywords: ['desktop', 'pc', 'computer', 'workstation', 'imac'] },
  { id: 'laptop', label: 'Laptop', color: COLORS.slate, keywords: ['laptop', 'macbook', 'thinkpad'] },
  { id: 'tablet', label: 'Tablet', color: COLORS.violet, keywords: ['tablet', 'ipad', 'kiosk'] },
  { id: 'watch', label: 'Watch', color: COLORS.slate, keywords: ['smartwatch', 'wearable'] },
  { id: 'keyboard', label: 'Keyboard', color: COLORS.slate, keywords: ['keyboard', 'typing'] },
  { id: 'mouse', label: 'Mouse', color: COLORS.slate, keywords: ['mouse', 'click', 'clicks'] },
  { id: 'webcam', label: 'Webcam', color: COLORS.indigo, keywords: ['webcam', 'meeting', 'meetings', 'zoom'] },
  { id: 'usb', label: 'USB', color: COLORS.blue, keywords: ['usb'] },
  { id: 'bluetooth', label: 'Bluetooth', color: COLORS.blue, keywords: ['bluetooth', 'ble', 'beacon'] },
  { id: 'ethernet-port', label: 'Ethernet', color: COLORS.green, keywords: ['ethernet', 'switch', 'port', 'ports', 'poe', 'vlan'] },
  { id: 'cable', label: 'Cable', color: COLORS.slate, keywords: ['cable', 'cables', 'internet', 'broadband', 'fiber', 'isp', 'modem'] },
  { id: 'signal', label: 'Signal', color: COLORS.green, keywords: ['signal', 'rssi', 'reception'] },
  { id: 'radio-tower', label: 'Cell tower', color: COLORS.orange, keywords: ['cell', 'cellular', 'lte', '4g', '5g', 'sim', 'antenna'] },
  { id: 'satellite-dish', label: 'Satellite', color: COLORS.slate, keywords: ['satellite', 'starlink', 'dish'] },
  { id: 'radar', label: 'Radar', color: COLORS.green, keywords: ['radar', 'discovery', 'nmap', 'probe'] },
  { id: 'waypoints', label: 'Mesh', color: COLORS.indigo, keywords: ['mesh', 'zerotier', 'nebula', 'headscale', 'p2p', 'peer', 'peers'] },
  { id: 'unplug', label: 'Unplugged', color: COLORS.amber, keywords: ['unplug', 'unplugged', 'disconnect'] },
  { id: 'power', label: 'Restart', color: COLORS.red, keywords: ['reboot', 'reboots', 'restart', 'restarts', 'shutdown', 'poweroff', 'wol'] },
  { id: 'battery-charging', label: 'Charging', color: COLORS.green, keywords: ['charging', 'recharge', 'powerbank'] },
  { id: 'solar-panel', label: 'Solar panel', color: COLORS.blue, keywords: ['pv', 'photovoltaic', 'inverter', 'enphase'] },
  // Software and running it
  { id: 'webhook', label: 'Webhook', color: COLORS.pink, keywords: ['webhook', 'webhooks', 'hook', 'hooks', 'callback'] },
  { id: 'braces', label: 'API', color: COLORS.indigo, keywords: ['api', 'json', 'rest', 'graphql', 'endpoint', 'rpc'] },
  { id: 'file-code', label: 'Source code', color: COLORS.indigo, keywords: ['source', 'src', 'lint', 'compile'] },
  { id: 'file-cog', label: 'Config file', color: COLORS.slate, keywords: ['conf', 'yaml', 'yml', 'toml', 'ini', 'dotfiles'] },
  { id: 'file-archive', label: 'Zip', color: COLORS.amber, keywords: ['zip', 'tar', 'gzip', 'compress', 'compression', 'tarball'] },
  { id: 'folder-sync', label: 'Folder sync', color: COLORS.teal, keywords: ['syncthing', 'nextcloud', 'owncloud', 'dropbox', 'onedrive', 'gdrive'] },
  { id: 'git-pull-request', label: 'Pull request', color: COLORS.green, keywords: ['pr', 'prs', 'review', 'reviews', 'dependabot', 'renovate'] },
  { id: 'git-merge', label: 'Merge', color: COLORS.violet, keywords: ['merge', 'merges', 'rebase'] },
  { id: 'git-commit-horizontal', label: 'Commit', color: COLORS.orange, keywords: ['commit', 'commits'] },
  { id: 'workflow', label: 'Workflow', color: COLORS.teal, keywords: ['workflow', 'workflows', 'pipeline', 'pipelines', 'airflow', 'n8n', 'zapier', 'etl'] },
  { id: 'bot', label: 'Bot', color: COLORS.cyan, keywords: ['bot', 'bots', 'ai', 'llm', 'gpt', 'automation', 'robot'] },
  { id: 'brain', label: 'Brain', color: COLORS.pink, keywords: ['ml', 'model', 'models', 'training', 'inference'] },
  { id: 'puzzle', label: 'Plugin', color: COLORS.green, keywords: ['plugin', 'plugins', 'extension', 'extensions', 'addon', 'addons'] },
  { id: 'app-window', label: 'App', color: COLORS.blue, keywords: ['app', 'apps', 'application', 'applications'] },
  { id: 'layout-dashboard', label: 'Dashboard', color: COLORS.indigo, keywords: ['dashboard', 'dashboards', 'homarr', 'overview'] },
  { id: 'settings', label: 'Settings', color: COLORS.slate, keywords: ['settings', 'configuration', 'preferences'] },
  { id: 'sliders-horizontal', label: 'Controls', color: COLORS.violet, keywords: ['controls', 'tune', 'tuning', 'adjust', 'mixer'] },
  { id: 'toggle-right', label: 'Toggle', color: COLORS.green, keywords: ['toggle', 'relay', 'shelly', 'tasmota'] },
  { id: 'wrench', label: 'Maintenance', color: COLORS.slate, keywords: ['maintenance', 'fix', 'repair', 'patch', 'patches'] },
  { id: 'hammer', label: 'Tools', color: COLORS.amber, keywords: ['tools', 'tool', 'diy', 'makefile'] },
  { id: 'construction', label: 'Construction', color: COLORS.orange, keywords: ['construction', 'wip', 'roadwork'] },
  { id: 'trash-2', label: 'Trash', color: COLORS.red, keywords: ['trash', 'delete', 'prune', 'purge', 'garbage', 'gc', 'vacuum'] },
  { id: 'recycle', label: 'Recycle', color: COLORS.green, keywords: ['recycle', 'recycling', 'bin', 'bins'] },
  { id: 'history', label: 'History', color: COLORS.indigo, keywords: ['history', 'retention', 'versions', 'timeline'] },
  { id: 'rotate-ccw', label: 'Rollback', color: COLORS.orange, keywords: ['rollback', 'revert', 'undo', 'reset'] },
  { id: 'repeat', label: 'Repeat', color: COLORS.teal, keywords: ['repeat', 'recurring', 'loop', 'retry', 'retries'] },
  { id: 'infinity', label: 'Always on', color: COLORS.violet, keywords: ['infinite', 'forever', 'continuous', 'daemon', 'persistent'] },
  { id: 'arrow-left-right', label: 'Transfer', color: COLORS.blue, keywords: ['transfer', 'transfers', 'exchange', 'migrate', 'migration', 'migrations'] },
  { id: 'funnel', label: 'Filter', color: COLORS.cyan, keywords: ['filter', 'filters', 'spam', 'adblock', 'pihole', 'adguard', 'blocklist'] },
  { id: 'magnet', label: 'Torrents', color: COLORS.red, keywords: ['torrent', 'torrents', 'magnet', 'qbittorrent', 'transmission', 'deluge', 'seeding'] },
  { id: 'gauge', label: 'Gauge', color: COLORS.orange, keywords: ['gauge', 'load', 'usage', 'performance', 'meter'] },
  { id: 'activity', label: 'Activity', color: COLORS.green, keywords: ['activity', 'latency', 'pulse'] },
  { id: 'chart-line', label: 'Metrics', color: COLORS.blue, keywords: ['metrics', 'stats', 'analytics', 'grafana', 'prometheus', 'graph', 'influxdb'] },
  { id: 'chart-bar', label: 'Chart', color: COLORS.teal, keywords: ['chart', 'statistics', 'histogram'] },
  { id: 'chart-pie', label: 'Quota', color: COLORS.violet, keywords: ['quota', 'quotas', 'capacity', 'breakdown'] },
  { id: 'trending-up', label: 'Growth', color: COLORS.green, keywords: ['growth', 'trend', 'trends', 'trending'] },
  { id: 'search', label: 'Search', color: COLORS.blue, keywords: ['search', 'index', 'indexer', 'indexing', 'elasticsearch', 'meilisearch', 'crawl', 'crawler', 'seo'] },
  { id: 'eye', label: 'Watcher', color: COLORS.indigo, keywords: ['watcher', 'watchtower', 'observe', 'visibility', 'views'] },
  // People, access and security
  { id: 'fingerprint-pattern', label: 'Fingerprint', color: COLORS.pink, keywords: ['fingerprint', 'identity', 'biometric', 'sso', 'oauth', 'authelia', 'authentik', 'keycloak'] },
  { id: 'shield-check', label: 'Protected', color: COLORS.green, keywords: ['protected', 'compliance', 'verified'] },
  { id: 'shield-alert', label: 'Threat', color: COLORS.red, keywords: ['threat', 'threats', 'intrusion', 'ids', 'crowdsec', 'malware', 'vulnerability', 'cve'] },
  { id: 'lock-open', label: 'Unlocked', color: COLORS.amber, keywords: ['unlock', 'unlocked'] },
  { id: 'vault', label: 'Safe', color: COLORS.slate, keywords: ['safe', 'bitwarden', 'vaultwarden', 'keepass', '1password'] },
  { id: 'ban', label: 'Blocked', color: COLORS.red, keywords: ['block', 'blocked', 'ban', 'banned', 'deny', 'denied', 'forbidden'] },
  { id: 'user', label: 'User', color: COLORS.blue, keywords: ['person', 'profile'] },
  { id: 'user-plus', label: 'Sign-ups', color: COLORS.green, keywords: ['signup', 'signups', 'register', 'registration', 'onboarding', 'invite', 'invites'] },
  { id: 'user-cog', label: 'Admin', color: COLORS.slate, keywords: ['admin', 'admins', 'sudo', 'superuser', 'permissions'] },
  // How it went
  { id: 'circle-check', label: 'Success', color: COLORS.green, keywords: ['ok', 'success', 'passed', 'healthy', 'done', 'complete', 'completed'] },
  { id: 'circle-x', label: 'Failure', color: COLORS.red, keywords: ['fail', 'failed', 'failure', 'failures', 'broken'] },
  { id: 'triangle-alert', label: 'Warning', color: COLORS.amber, keywords: ['warning', 'warnings', 'warn', 'caution', 'degraded'] },
  { id: 'info', label: 'Info', color: COLORS.blue, keywords: ['info', 'information', 'about', 'notice'] },
  { id: 'siren', label: 'Emergency', color: COLORS.red, keywords: ['emergency', 'panic', 'pager', 'pagerduty', 'oncall'] },
  { id: 'skull', label: 'Danger', color: COLORS.slate, keywords: ['danger', 'deadman', 'dead', 'kill', 'killswitch'] },
  { id: 'ghost', label: 'Ghost', color: COLORS.violet, keywords: ['ghost', 'zombie', 'zombies', 'orphan', 'orphaned', 'stale'] },
  { id: 'life-buoy', label: 'Rescue', color: COLORS.red, keywords: ['rescue', 'help', 'recovery', 'disaster', 'dr', 'failover'] },
  { id: 'bell-off', label: 'Muted', color: COLORS.slate, keywords: ['mute', 'muted', 'silence', 'silenced', 'snooze', 'quiet', 'dnd'] },
  { id: 'thumbs-up', label: 'Approve', color: COLORS.blue, keywords: ['approve', 'approved', 'approval', 'like', 'likes', 'vote', 'feedback'] },
  // Time
  { id: 'hourglass', label: 'Hourglass', color: COLORS.amber, keywords: ['wait', 'pending', 'ttl', 'expiry', 'expire', 'expires', 'expiration'] },
  { id: 'alarm-clock', label: 'Alarm', color: COLORS.red, keywords: ['alarm', 'alarms', 'wake', 'wakeup'] },
  { id: 'calendar-check', label: 'Due date', color: COLORS.green, keywords: ['due', 'deadline', 'deadlines', 'appointment', 'appointments'] },
  { id: 'sunrise', label: 'Morning', color: COLORS.orange, keywords: ['morning', 'sunrise', 'dawn'] },
  { id: 'sunset', label: 'Evening', color: COLORS.pink, keywords: ['evening', 'sunset', 'dusk'] },
  // Weather and nature
  { id: 'cloud-sun', label: 'Forecast', color: COLORS.cyan, keywords: ['forecast', 'climate', 'meteo'] },
  { id: 'cloud-rain', label: 'Rain', color: COLORS.blue, keywords: ['rain', 'rainfall', 'precipitation', 'umbrella'] },
  { id: 'cloud-lightning', label: 'Storm', color: COLORS.indigo, keywords: ['storm', 'storms', 'thunder', 'lightning'] },
  { id: 'snowflake', label: 'Cold', color: COLORS.cyan, keywords: ['freezer', 'frost', 'snow', 'winter', 'ice'] },
  { id: 'flame', label: 'Fire', color: COLORS.orange, keywords: ['fire', 'flame', 'stove', 'fireplace'] },
  { id: 'wind', label: 'Wind', color: COLORS.teal, keywords: ['wind', 'ventilation'] },
  { id: 'waves', label: 'Waves', color: COLORS.blue, keywords: ['waves', 'wave', 'tide', 'ocean', 'sea', 'surf'] },
  { id: 'mountain', label: 'Mountain', color: COLORS.slate, keywords: ['mountain', 'mountains', 'hike', 'hiking', 'ski'] },
  { id: 'tree-pine', label: 'Tree', color: COLORS.green, keywords: ['tree', 'trees', 'forest', 'christmas'] },
  { id: 'flower', label: 'Flower', color: COLORS.pink, keywords: ['flower', 'flowers', 'bloom'] },
  { id: 'sprout', label: 'Seedling', color: COLORS.emerald, keywords: ['seedling', 'seedlings', 'seeds', 'grow', 'hydroponics'] },
  { id: 'wheat', label: 'Crops', color: COLORS.amber, keywords: ['crops', 'crop', 'wheat', 'harvest', 'grain'] },
  { id: 'tractor', label: 'Farm', color: COLORS.green, keywords: ['tractor', 'agriculture'] },
  { id: 'telescope', label: 'Telescope', color: COLORS.indigo, keywords: ['telescope', 'astronomy', 'observatory'] },
  { id: 'dog', label: 'Dog', color: COLORS.amber, keywords: ['dog', 'dogs', 'pet', 'pets', 'puppy', 'walk'] },
  { id: 'cat', label: 'Cat', color: COLORS.orange, keywords: ['cat', 'cats', 'kitten', 'litter', 'feeder'] },
  { id: 'fish', label: 'Fish', color: COLORS.cyan, keywords: ['fish', 'aquarium', 'tank'] },
  { id: 'bird', label: 'Bird', color: COLORS.teal, keywords: ['bird', 'birds', 'chicken', 'chickens', 'coop', 'birdfeeder'] },
  { id: 'rabbit', label: 'Rabbit', color: COLORS.pink, keywords: ['rabbit', 'rabbitmq', 'amqp', 'bunny'] },
  { id: 'turtle', label: 'Slow', color: COLORS.green, keywords: ['slow', 'lag', 'sluggish', 'turtle'] },
  // Around the house
  { id: 'lightbulb', label: 'Light', color: COLORS.amber, keywords: ['light', 'lights', 'lamp', 'bulb', 'hue', 'lighting'] },
  { id: 'fan', label: 'Fan', color: COLORS.cyan, keywords: ['fan', 'fans', 'cooling', 'cooler'] },
  { id: 'air-vent', label: 'HVAC', color: COLORS.teal, keywords: ['hvac', 'ac', 'aircon', 'vent', 'humidity'] },
  { id: 'heater', label: 'Heater', color: COLORS.red, keywords: ['heater', 'heating', 'boiler', 'radiator', 'furnace'] },
  { id: 'door-open', label: 'Door', color: COLORS.amber, keywords: ['doorbell'] },
  { id: 'bed', label: 'Bedroom', color: COLORS.indigo, keywords: ['bed'] },
  { id: 'sofa', label: 'Living room', color: COLORS.violet, keywords: ['sofa', 'couch'] },
  { id: 'bath', label: 'Bathroom', color: COLORS.cyan, keywords: ['bath', 'shower', 'toilet'] },
  { id: 'refrigerator', label: 'Fridge', color: COLORS.blue, keywords: ['fridge', 'refrigerator'] },
  { id: 'washing-machine', label: 'Laundry', color: COLORS.blue, keywords: ['laundry', 'washer', 'washing', 'dryer', 'dishwasher'] },
  { id: 'utensils', label: 'Food', color: COLORS.orange, keywords: ['food', 'meal', 'meals', 'recipe', 'recipes', 'cooking', 'lunch', 'dinner', 'mealie'] },
  { id: 'beer', label: 'Beer', color: COLORS.amber, keywords: ['beer', 'brewing', 'fermentation', 'pub'] },
  { id: 'baby', label: 'Baby', color: COLORS.pink, keywords: ['baby', 'kid', 'kids', 'child', 'children', 'nursery'] },
  { id: 'mailbox', label: 'Mailbox', color: COLORS.blue, keywords: ['mailbox', 'postal', 'letter', 'letters'] },
  // Health and getting about
  { id: 'heart', label: 'Heart', color: COLORS.red, keywords: ['heart', 'love', 'favourite'] },
  { id: 'pill', label: 'Medicine', color: COLORS.emerald, keywords: ['pill', 'pills', 'medicine', 'medication', 'meds', 'pharmacy', 'prescription'] },
  { id: 'stethoscope', label: 'Doctor', color: COLORS.teal, keywords: ['doctor', 'medical', 'clinic', 'checkup', 'hospital'] },
  { id: 'dumbbell', label: 'Workout', color: COLORS.slate, keywords: ['workout', 'gym', 'fitness', 'exercise'] },
  { id: 'bike', label: 'Bike', color: COLORS.green, keywords: ['bike', 'bikes', 'bicycle', 'cycling', 'ride'] },
  { id: 'footprints', label: 'Steps', color: COLORS.amber, keywords: ['walking', 'pedometer', 'footprints'] },
  { id: 'plane', label: 'Flight', color: COLORS.blue, keywords: ['flight', 'flights', 'plane', 'travel', 'airport', 'trip'] },
  { id: 'train-front', label: 'Train', color: COLORS.red, keywords: ['train', 'trains', 'rail', 'railway', 'commute', 'metro'] },
  { id: 'bus', label: 'Bus', color: COLORS.orange, keywords: ['bus', 'transit', 'transport'] },
  { id: 'ship', label: 'Boat', color: COLORS.cyan, keywords: ['boat', 'ship', 'ferry', 'cruise', 'sailing'] },
  { id: 'map', label: 'Map', color: COLORS.green, keywords: ['map', 'maps', 'gps', 'geo', 'osm'] },
  { id: 'map-pin', label: 'Location', color: COLORS.red, keywords: ['location', 'locations', 'place', 'places', 'geofence', 'owntracks'] },
  { id: 'navigation', label: 'Navigation', color: COLORS.blue, keywords: ['navigation', 'navigate', 'directions'] },
  { id: 'compass', label: 'Compass', color: COLORS.orange, keywords: ['compass', 'direction', 'explore', 'discover'] },
  { id: 'earth', label: 'Earth', color: COLORS.teal, keywords: ['earth', 'world', 'international', 'region', 'regions'] },
  { id: 'tent', label: 'Camping', color: COLORS.green, keywords: ['camping', 'camp', 'tent'] },
  { id: 'fuel', label: 'Fuel', color: COLORS.amber, keywords: ['fuel', 'gas', 'petrol', 'diesel', 'oil', 'propane'] },
  // Money and work
  { id: 'wallet', label: 'Wallet', color: COLORS.amber, keywords: ['wallet', 'budget', 'budgets', 'expenses', 'spending', 'firefly'] },
  { id: 'piggy-bank', label: 'Savings', color: COLORS.pink, keywords: ['savings', 'saving', 'piggy', 'pension', 'retirement'] },
  { id: 'receipt', label: 'Receipt', color: COLORS.slate, keywords: ['receipt', 'receipts', 'expense', 'bill', 'bills', 'paperless'] },
  { id: 'dollar-sign', label: 'Money', color: COLORS.green, keywords: ['money', 'revenue', 'sales', 'price', 'prices', 'cost', 'costs', 'income', 'payroll'] },
  { id: 'bitcoin', label: 'Crypto', color: COLORS.orange, keywords: ['crypto', 'bitcoin', 'btc', 'blockchain', 'mining', 'miner', 'ethereum'] },
  { id: 'chart-candlestick', label: 'Stocks', color: COLORS.emerald, keywords: ['stocks', 'trading', 'market', 'markets', 'invest', 'investing', 'portfolio'] },
  { id: 'landmark', label: 'Bank', color: COLORS.indigo, keywords: ['bank', 'banking', 'finance', 'tax', 'taxes', 'government'] },
  { id: 'calculator', label: 'Calculator', color: COLORS.slate, keywords: ['calculator', 'calc', 'math', 'accounting', 'bookkeeping'] },
  { id: 'percent', label: 'Discount', color: COLORS.red, keywords: ['percent', 'percentage', 'discount', 'discounts', 'coupon', 'coupons', 'deals', 'sale'] },
  { id: 'handshake', label: 'Partners', color: COLORS.amber, keywords: ['partner', 'partners', 'client', 'clients', 'customer', 'customers', 'crm', 'deal'] },
  { id: 'scale', label: 'Legal', color: COLORS.slate, keywords: ['legal', 'law', 'contract', 'contracts', 'gdpr', 'privacy', 'terms'] },
  { id: 'briefcase', label: 'Work', color: COLORS.amber, keywords: ['work', 'business', 'career', 'freelance'] },
  { id: 'building', label: 'Office', color: COLORS.slate, keywords: ['company', 'corporate'] },
  { id: 'factory', label: 'Factory', color: COLORS.slate, keywords: ['factory', 'industrial', 'manufacturing', 'plc', 'scada'] },
  { id: 'warehouse', label: 'Warehouse', color: COLORS.amber, keywords: ['warehouse', 'inventory', 'stock', 'stocktake', 'wms'] },
  { id: 'store', label: 'Storefront', color: COLORS.pink, keywords: ['storefront', 'retail', 'woocommerce', 'shopify', 'magento'] },
  { id: 'shopping-bag', label: 'Groceries', color: COLORS.green, keywords: ['groceries', 'grocery', 'shopping', 'supermarket'] },
  { id: 'shirt', label: 'Clothes', color: COLORS.blue, keywords: ['clothes', 'clothing', 'fashion', 'wardrobe', 'shirt'] },
  { id: 'package', label: 'Parcel', color: COLORS.amber, keywords: ['parcel', 'parcels', 'delivery', 'deliveries', 'shipment', 'tracking', 'courier'] },
  { id: 'truck', label: 'Truck', color: COLORS.slate, keywords: ['truck', 'trucks', 'shipping', 'logistics', 'fleet', 'freight'] },
  // Messages, reading and media
  { id: 'message-square', label: 'Chat', color: COLORS.blue, keywords: ['chat', 'slack', 'discord', 'matrix', 'message', 'messages', 'irc', 'mattermost'] },
  { id: 'send', label: 'Send', color: COLORS.cyan, keywords: ['send', 'sending', 'sent', 'outgoing', 'dispatch', 'telegram'] },
  { id: 'inbox', label: 'Inbox', color: COLORS.indigo, keywords: ['inbox', 'unread', 'incoming'] },
  { id: 'phone', label: 'Call', color: COLORS.green, keywords: ['call', 'calls', 'voip', 'sip', 'asterisk', 'pbx', 'landline'] },
  { id: 'megaphone', label: 'Announcement', color: COLORS.orange, keywords: ['announce', 'announcement', 'announcements', 'marketing', 'campaign'] },
  { id: 'rss', label: 'RSS', color: COLORS.orange, keywords: ['rss', 'feed', 'feeds', 'freshrss', 'miniflux'] },
  { id: 'newspaper', label: 'News', color: COLORS.slate, keywords: ['news', 'headlines', 'digest'] },
  { id: 'library', label: 'Library', color: COLORS.amber, keywords: ['library', 'books', 'ebook', 'ebooks', 'calibre', 'kavita', 'komga'] },
  { id: 'book-headphones', label: 'Audiobooks', color: COLORS.violet, keywords: ['audiobook', 'audiobooks', 'audiobookshelf'] },
  { id: 'graduation-cap', label: 'School', color: COLORS.indigo, keywords: ['school', 'university', 'college', 'course', 'courses', 'study', 'homework'] },
  { id: 'languages', label: 'Translation', color: COLORS.teal, keywords: ['translate', 'translation', 'translations', 'language', 'i18n', 'locale'] },
  { id: 'notebook-pen', label: 'Notes', color: COLORS.amber, keywords: ['notes', 'note', 'journal', 'diary', 'obsidian', 'joplin', 'memos'] },
  { id: 'clipboard-list', label: 'Checklist', color: COLORS.green, keywords: ['checklist', 'todo', 'todos', 'chores'] },
  { id: 'kanban', label: 'Kanban', color: COLORS.blue, keywords: ['kanban', 'sprint', 'sprints', 'trello', 'planka', 'wekan'] },
  { id: 'sheet', label: 'Spreadsheet', color: COLORS.emerald, keywords: ['spreadsheet', 'spreadsheets', 'csv', 'excel', 'sheets', 'xlsx'] },
  { id: 'table', label: 'Table', color: COLORS.slate, keywords: ['tables', 'rows', 'airtable', 'nocodb', 'baserow'] },
  { id: 'list', label: 'List', color: COLORS.slate, keywords: ['queue', 'queues', 'backlog'] },
  { id: 'ticket', label: 'Ticket', color: COLORS.pink, keywords: ['ticket', 'tickets', 'support', 'helpdesk', 'jira', 'issue', 'issues'] },
  { id: 'tag', label: 'Tag', color: COLORS.teal, keywords: ['label', 'labels', 'version', 'semver'] },
  { id: 'bookmark', label: 'Bookmark', color: COLORS.red, keywords: ['bookmark', 'bookmarks', 'linkding', 'linkwarden', 'wallabag'] },
  { id: 'paperclip', label: 'Attachment', color: COLORS.slate, keywords: ['attachment', 'attachments', 'paperclip'] },
  { id: 'signature', label: 'Signature', color: COLORS.indigo, keywords: ['sign', 'signing', 'signature', 'signed', 'docusign'] },
  { id: 'id-card', label: 'ID card', color: COLORS.blue, keywords: ['license', 'licence', 'licenses', 'passport', 'membership'] },
  { id: 'qr-code', label: 'QR code', color: COLORS.slate, keywords: ['qr', 'barcode', 'barcodes'] },
  { id: 'hash', label: 'Hash', color: COLORS.violet, keywords: ['hash', 'checksum', 'checksums', 'sha', 'sha256', 'md5', 'integrity'] },
  { id: 'palette', label: 'Design', color: COLORS.pink, keywords: ['design', 'theme', 'themes', 'colours', 'colors', 'art', 'paint'] },
  { id: 'image', label: 'Image', color: COLORS.teal, keywords: ['picture', 'pictures', 'gallery', 'immich', 'photoprism', 'wallpaper'] },
  { id: 'film', label: 'Movies', color: COLORS.slate, keywords: ['movie', 'movies', 'film', 'films', 'radarr', 'cinema'] },
  { id: 'video', label: 'Recording', color: COLORS.red, keywords: ['recording', 'recordings', 'stream', 'streaming', 'youtube', 'twitch', 'obs'] },
  { id: 'radio', label: 'Radio', color: COLORS.orange, keywords: ['radio', 'fm', 'broadcast', 'icecast', 'sdr'] },
  { id: 'disc-3', label: 'Disc', color: COLORS.violet, keywords: ['dvd', 'bluray', 'disc', 'discs', 'makemkv'] },
  { id: 'guitar', label: 'Guitar', color: COLORS.amber, keywords: ['guitar', 'instrument', 'band'] },
  { id: 'headphones', label: 'Headphones', color: COLORS.indigo, keywords: ['headphones', 'earbuds', 'airpods'] },
  { id: 'speaker', label: 'Speaker', color: COLORS.slate, keywords: ['speaker', 'speakers', 'sound', 'soundbar'] },
  { id: 'mic', label: 'Microphone', color: COLORS.red, keywords: ['mic', 'microphone', 'voice', 'dictation'] },
  { id: 'cast', label: 'Cast', color: COLORS.blue, keywords: ['cast', 'casting', 'chromecast', 'airplay'] },
  // Fun and the rest
  { id: 'joystick', label: 'Arcade', color: COLORS.violet, keywords: ['arcade', 'retro', 'emulator', 'emulation', 'retroarch'] },
  { id: 'dice-5', label: 'Dice', color: COLORS.red, keywords: ['dice', 'random', 'chance', 'lottery'] },
  { id: 'trophy', label: 'Trophy', color: COLORS.amber, keywords: ['trophy', 'award', 'awards', 'score', 'scores', 'leaderboard'] },
  { id: 'crown', label: 'Crown', color: COLORS.amber, keywords: ['crown', 'premium', 'vip'] },
  { id: 'target', label: 'Goal', color: COLORS.red, keywords: ['goal', 'goals', 'kpi', 'okr'] },
  { id: 'gift', label: 'Gift', color: COLORS.pink, keywords: ['gift', 'gifts'] },
  { id: 'cake', label: 'Birthday', color: COLORS.pink, keywords: ['birthday', 'birthdays', 'anniversary', 'cake'] },
  { id: 'party-popper', label: 'Party', color: COLORS.violet, keywords: ['party', 'celebration', 'celebrate'] },
  { id: 'smile', label: 'Smile', color: COLORS.amber, keywords: ['smile', 'happy', 'mood', 'fun'] },
  { id: 'flask-conical', label: 'Lab', color: COLORS.emerald, keywords: ['experiment', 'experiments', 'science', 'chemistry'] },
  // The rest of Lucide that suits a check (iconCatalog.ts): found by search, but without keywords, so a check's name
  // never suggests one.
  ...MORE_PRESETS.map((more) => ({ ...more, color: COLORS[more.color], keywords: [] })),
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
  'morning', 'evening', 'config', 'app', 'apps', 'application', 'applications',
]);

export const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function words(check: Check): string[] {
  return wordsOf(`${check.name} ${check.tags}`);
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
    if (match && !suggested.includes(match)) {
      suggested.push(match);
    }
  }
  const fresh = [...suggested, ...PRESETS].find((preset) => !used.has(presetRef(preset.id)));
  return presetRef((fresh ?? suggested[0] ?? PRESETS[0]).id);
}

export type SavedCheckIcons = Record<string, IconRef>; // "<projectId>/<checkId>"

export const computeIconAssignmentKey = (projectId: string, checkOrCheckId: Check | string) =>
  `${projectId}/${typeof checkOrCheckId === 'string' ? checkOrCheckId : checkIdOf(checkOrCheckId)}`;

/** Icons taken in a project, ignoring `exceptIconAssignmentKey`; with `liveIconAssignmentKeys`, only current checks count. */
export function iconsInUse(savedIconsByCheck: SavedCheckIcons, projectId: string, liveIconAssignmentKeys?: Set<string>, exceptIconAssignmentKey?: string): Set<IconRef> {
  const projectPrefix = `${projectId}/`;
  const iconsTaken = new Set<IconRef>();
  for (const [iconAssignmentKey, savedIcon] of Object.entries(savedIconsByCheck)) {
    // Another project's check
    if (!iconAssignmentKey.startsWith(projectPrefix)) {
      continue;
    }
    // The check being edited / should not update
    if (iconAssignmentKey === exceptIconAssignmentKey) {
      continue;
    }
    // Not in the project's latest list (deleted on healthchecks.io)
    if (liveIconAssignmentKeys && !liveIconAssignmentKeys.has(iconAssignmentKey)) {
      continue;
    }
    iconsTaken.add(savedIcon);
  }
  return iconsTaken;
}

/** Give checks without an icon their default, in list order and without repeats. Only adds, never changes or removes; same object if nothing added. */
export function withDefaultIconsForNewChecks(savedIconsByCheck: SavedCheckIcons, projectId: string, checks: Check[]): SavedCheckIcons {
  // Checks without an icon yet. None: return the same object, so nothing is re-saved.
  const checksWithAssignmentKeys = checks.map((check) => ({ check, iconAssignmentKey: computeIconAssignmentKey(projectId, check) }));
  const checksWithoutIcon = checksWithAssignmentKeys.filter(({ iconAssignmentKey }) => !savedIconsByCheck[iconAssignmentKey]);
  if (checksWithoutIcon.length === 0) {
    return savedIconsByCheck;
  }

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

/** A project's new API key: the id it gets for each check whose icon is saved under another id, as when the key changes
 *  kind (a regular key gets a check's uuid, a read-only one its unique_key). By the old id; a check not found is left out. */
export async function findCheckIdsWithNewKey(savedIconsByCheck: SavedCheckIcons, projectId: string, checksWithNewKey: Check[], newKeyApi: Pick<HealthchecksApi, 'getCheck'>): Promise<Record<string, string>> {
  const projectPrefix = `${projectId}/`;
  const checkIdsWithNewKey = new Set(checksWithNewKey.map(checkIdOf));
  const oldCheckIds = Object.keys(savedIconsByCheck)
    .filter((iconAssignmentKey) => iconAssignmentKey.startsWith(projectPrefix))
    .map((iconAssignmentKey) => iconAssignmentKey.slice(projectPrefix.length))
    .filter((checkId) => !checkIdsWithNewKey.has(checkId));
  const newCheckIdsByOldCheckId: Record<string, string> = {};
  // One at a time, to go easy on healthchecks.io's limit of about 100 requests a minute.
  for (const oldCheckId of oldCheckIds) {
    try {
      // healthchecks.io finds a check by either of its ids, with either kind of key, and answers with the one this key gets.
      newCheckIdsByOldCheckId[oldCheckId] = checkIdOf(await newKeyApi.getCheck(oldCheckId));
    } catch {
      // Deleted on healthchecks.io, or not reached: its icon stays under the old id.
    }
  }
  return newCheckIdsByOldCheckId;
}

/** Icons saved under a check's old id, moved to its new one. */
export function withIconsMovedToNewCheckIds(savedIconsByCheck: SavedCheckIcons, projectId: string, newCheckIdsByOldCheckId: Record<string, string>): SavedCheckIcons {
  const savedIconsWithNewCheckIds = { ...savedIconsByCheck };
  for (const [oldCheckId, newCheckId] of Object.entries(newCheckIdsByOldCheckId)) {
    const oldIconAssignmentKey = computeIconAssignmentKey(projectId, oldCheckId);
    const movedIcon = savedIconsWithNewCheckIds[oldIconAssignmentKey];
    if (movedIcon) {
      delete savedIconsWithNewCheckIds[oldIconAssignmentKey];
      // The icon the check showed until now wins over one saved under the new id before.
      savedIconsWithNewCheckIds[computeIconAssignmentKey(projectId, newCheckId)] = movedIcon;
    }
  }
  return savedIconsWithNewCheckIds;
}
