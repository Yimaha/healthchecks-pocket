// Names people search for, mostly products, services and tools, that the presets' labels, keywords and Lucide
// tags leave out, so that "claude" or "uptime kuma" finds an icon. By topic, each with the icons that suit it.
// Drawn from healthchecks.io's integrations, the Stack Overflow 2025 Developer Survey, the selfh.st 2025
// self-hosting survey and the CNCF's 2025 survey, plus what people commonly monitor with cron checks.
// Search only: a check's name never picks its default icon from these.
// One word each, names of several words run together ("homeassistant"): search tries the words typed run
// together too, so "home assistant" and "Pi-hole" find them.

export const SEARCH_TERMS: [terms: string, iconIds: string[]][] = [
  // AI assistants, models and tools
  ['claude anthropic openai chatgpt gpt codex gemini bard copilot cursor windsurf ollama llama mistral deepseek qwen grok xai perplexity huggingface llm llms chatbot assistant agent agents mcp langchain llamaindex vllm openwebui lmstudio localai aider cline opencode lovable openrouter groq replicate', ['bot', 'brain', 'sparkles', 'bot-message-square', 'brain-circuit']],
  ['midjourney stablediffusion sdxl flux comfyui automatic1111 dalle sora runway imagen', ['image', 'wand-sparkles', 'palette', 'sparkles']],
  ['whisper elevenlabs tts stt transcribe transcription dictate', ['mic', 'audio-waveform', 'audio-lines']],
  ['pinecone weaviate qdrant chroma chromadb milvus pgvector embedding embeddings vector vectordb rag', ['database', 'database-zap', 'brain-circuit']],
  ['pytorch tensorflow keras jupyter notebook colab kaggle mlflow wandb sagemaker bedrock vertexai finetune', ['brain', 'flask-conical', 'gpu', 'chart-line']],
  ['nvidia cuda rocm amd radeon geforce rtx', ['gpu', 'microchip']],

  // Cloud providers and hosting
  ['aws amazon gcp googlecloud azure microsoftazure oci oraclecloud ibmcloud alibabacloud', ['cloud', 'server', 'globe']],
  ['ec2 lightsail droplet droplets linode hetzner ovh ovhcloud vultr scaleway digitalocean contabo upcloud ionos netcup akamai', ['server', 'cloud']],
  ['cloudflare vercel netlify heroku railway render flyio fly cloudrun appengine fargate amplify pages workers', ['cloud', 'rocket', 'globe']],
  ['lambda serverless functions azurefunctions cloudfunctions', ['lambda', 'square-function', 'zap']],
  ['s3 r2 b2 backblaze wasabi minio gcs blob azureblob objectstorage bucket buckets', ['cloud-upload', 'archive', 'database']],
  ['cloudwatch stackdriver azuremonitor', ['chart-line', 'eye']],

  // Databases and search engines
  ['postgres postgresql psql mysql mariadb sqlite mssql sqlserver oracle mongodb mongo redis valkey keydb memcached cassandra scylla clickhouse duckdb cockroachdb timescale timescaledb influxdb questdb neo4j couchdb couchbase supabase neon planetscale pocketbase firebase firestore dynamodb cosmosdb snowflake databricks bigquery redshift', ['database', 'database-backup', 'database-zap', 'server']],
  ['elasticsearch opensearch meilisearch typesense solr algolia', ['search', 'database']],
  ['pgbackrest barman walg xtrabackup pgdump mysqldump mongodump replica replicas', ['database-backup', 'refresh-cw']],

  // Containers, orchestration and infrastructure as code
  ['docker dockerhub dockercompose kubernetes k8s k3s k0s microk8s minikube openshift rancher podman containerd cri lxc lxd incus portainer dockge komodo coolify dokploy caprover swarm nomad', ['container', 'boxes', 'ship-wheel', 'layers']],
  ['helm argocd fluxcd kustomize', ['ship-wheel', 'workflow']],
  ['watchtower diun renovate dependabot wud whatsupdocker unattendedupgrades', ['refresh-cw', 'box', 'download']],
  ['terraform opentofu pulumi ansible chef puppet saltstack salt cloudformation bicep packer vagrant', ['server-cog', 'file-cog', 'settings']],
  ['proxmox pve pbs esxi vmware vsphere vcenter hyperv kvm qemu xen xcpng virtualbox libvirt', ['layers', 'server', 'monitor-cloud']],

  // CI/CD and code hosting
  ['github gitlab bitbucket gitea forgejo gogs codeberg sourcehut', ['git-branch', 'git-fork', 'git-pull-request', 'folder-git']],
  ['githubactions actions jenkins circleci travis buildkite drone woodpecker teamcity bamboo azuredevops azurepipelines tekton gitlabci', ['workflow', 'rocket', 'code']],
  ['sonarqube codecov coveralls snyk', ['shield-check', 'chart-bar']],
  ['playwright cypress selenium puppeteer jest vitest pytest junit phpunit rspec mocha', ['flask-conical', 'test-tubes', 'circle-check']],

  // Languages, frameworks and package managers
  ['python javascript typescript nodejs deno bun golang rust java kotlin scala csharp dotnet php ruby perl elixir erlang haskell swift dart', ['code', 'file-code', 'code-xml', 'braces']],
  ['rails django flask fastapi laravel symfony spring springboot express nextjs nuxt react vue svelte sveltekit angular astro remix phoenix blazor aspnet', ['code', 'app-window', 'globe']],
  ['npm yarn pnpm pip pipx poetry uv conda cargo crates rubygems bundler composer maven gradle nuget homebrew brew apt dnf yum pacman snap flatpak winget chocolatey scoop', ['box', 'package', 'download']],
  ['vscode neovim vim emacs jetbrains intellij pycharm webstorm xcode androidstudio zed sublime', ['code', 'code-xml', 'square-terminal']],
  ['postman insomnia bruno swagger openapi grpc trpc', ['braces', 'webhook']],

  // Running scripts on a schedule
  ['bash zsh powershell pwsh cmd sh fish shellscript cli', ['terminal', 'square-terminal', 'file-terminal']],
  ['crontab cronjob cronjobs systemd systemctl timers anacron launchd taskscheduler schtasks celery celerybeat sidekiq resque hangfire quartz apscheduler bullmq agenda rundeck', ['clock', 'calendar-clock', 'timer', 'alarm-clock']],
  ['kafka rabbitmq nats mqtt mosquitto emqx activemq sqs sns pubsub redpanda pulsar zeromq', ['list', 'send', 'waypoints']],

  // Monitoring and on-call
  ['healthchecks healthchecksio cronitor deadmanssnitch cronhub heartbeat canary watchdog keepalive liveness readiness', ['heart-pulse', 'activity', 'link']],
  ['uptimekuma kuma gatus statping cachet uptimerobot pingdom betteruptime betterstack hetrixtools updown statuspage instatus', ['heart-pulse', 'activity', 'circle-check']],
  ['prometheus grafana alertmanager telegraf victoriametrics mimir thanos datadog newrelic dynatrace appdynamics', ['chart-line', 'gauge', 'activity']],
  ['zabbix nagios icinga checkmk librenms observium prtg netdata glances beszel', ['gauge', 'activity', 'server']],
  ['loki graylog splunk elk kibana logstash fluentd fluentbit papertrail logtail syslog journald journalctl', ['file-text', 'logs', 'scroll-text']],
  ['sentry rollbar bugsnag honeybadger glitchtip airbrake', ['bug', 'triangle-alert']],
  ['opentelemetry otel jaeger zipkin tempo tracing traces apm', ['waypoints', 'activity']],
  ['pagerduty opsgenie pagertree splunkoncall victorops spike incidentio firehydrant rootly grafanaoncall', ['siren', 'bell-ring', 'phone-call']],
  ['grace overdue late missed timeout', ['hourglass', 'clock-alert', 'timer']],

  // Where alerts go (healthchecks.io's integrations)
  ['slack discord telegram matrix element mattermost rocketchat zulip teams msteams googlechat signal whatsapp wechat irc', ['message-square', 'send', 'messages-square']],
  ['pushover pushbullet ntfy gotify apprise pushcut bark', ['bell', 'bell-ring', 'smartphone']],
  ['gmail outlook smtp sendgrid mailgun postmark ses resend mailchimp brevo mailcow mailu stalwart postfix dovecot', ['mail', 'mails', 'send']],
  ['sms twilio vonage voip', ['smartphone', 'phone', 'message-square']],
  ['trello jira linear asana clickup notion monday basecamp', ['kanban', 'ticket', 'clipboard-list']],
  ['zapier ifttt n8n make integromat pipedream nodered huginn activepieces', ['webhook', 'workflow']],

  // Backups and storage
  ['restic borg borgbackup borgmatic kopia duplicati duplicacy rclone rsync rsnapshot timeshift veeam acronis borgbase rsyncnet velero proxmoxbackupserver urbackup timemachine bacula tarsnap', ['archive', 'database-backup', 'cloud-upload', 'hard-drive-upload', 'folder-sync']],
  ['zfs btrfs lvm sanoid syncoid zrepl', ['hard-drive', 'layers', 'camera']],
  ['truenas unraid synology qnap openmediavault omv nas raid ceph seaweedfs glusterfs nfs smb samba iscsi', ['hard-drive', 'server', 'database']],
  ['googledrive gdrive onedrive icloud dropbox protondrive mega pcloud', ['cloud', 'cloud-upload', 'folder-sync']],
  ['nextcloud owncloud seafile syncthing resilio filebrowser sftpgo', ['folder-sync', 'folder', 'cloud']],
  ['smartctl smartmontools ssd nvme hdd sata', ['hard-drive']],

  // Operating systems and hardware
  ['linux ubuntu debian fedora rhel redhat centos rocky alma arch alpine nixos opensuse gentoo windows windowsserver macos freebsd openbsd', ['terminal', 'monitor', 'server', 'laptop']],
  ['raspberrypi raspberry rpi orangepi jetson arduino esp32 esp8266 pico', ['cpu', 'microchip', 'circuit-board']],
  ['homelab minipc nuc rack datacenter', ['server', 'pc-case', 'building-complex']],
  ['ipmi idrac ilo bmc wakeonlan', ['server-cog', 'power']],
  ['ups nut apcupsd', ['battery-charging', 'plug-zap', 'zap']],

  // Networks, DNS and VPNs
  ['pihole adguard adguardhome blocky technitium unbound bind9 coredns powerdns dnsmasq', ['funnel', 'network', 'globe']],
  ['dns ddns duckdns dyndns noip namecheap porkbun godaddy route53 registrar domain domains whois', ['globe', 'earth']],
  ['tailscale wireguard openvpn zerotier netbird headscale nebula ipsec strongswan protonvpn mullvad nordvpn', ['network', 'lock', 'shield', 'waypoints']],
  ['opnsense pfsense openwrt ddwrt mikrotik ubiquiti unifi edgerouter fortinet fortigate sophos', ['router', 'brick-wall-fire', 'shield']],
  ['nginx apache httpd caddy traefik haproxy envoy nginxproxymanager swag pangolin cloudflared cloudflaretunnel iis reverseproxy', ['globe', 'network', 'arrow-left-right']],
  ['icmp traceroute mtr iperf packetloss', ['activity', 'zap', 'gauge']],

  // Certificates, passwords and sign-in
  ['letsencrypt certbot acme acmesh certmanager zerossl ssl tls https expiry', ['badge-check', 'lock', 'shield-check']],
  ['hashicorpvault passbolt keepassxc lastpass bitwarden vaultwarden', ['vault', 'key-round', 'lock']],
  ['authelia authentik keycloak zitadel pocketid tinyauth okta auth0 entra ldap freeipa oidc saml 2fa mfa totp', ['fingerprint-pattern', 'key', 'shield-user', 'user-lock']],
  ['fail2ban suricata snort wazuh ossec clamav trivy', ['shield-alert', 'shield']],

  // Self-hosted apps (selfh.st's favourites)
  ['jellyfin plex emby kodi infuse', ['tv', 'film', 'clapperboard']],
  ['sonarr radarr lidarr readarr prowlarr bazarr jackett overseerr jellyseerr ombi tautulli arr', ['film', 'tv', 'download', 'search']],
  ['qbittorrent transmission deluge rtorrent sabnzbd nzbget usenet', ['magnet', 'download']],
  ['navidrome subsonic airsonic funkwhale spotify', ['music', 'headphones', 'disc-3']],
  ['audiobookshelf calibreweb booklore', ['book-headphones', 'library']],
  ['immich photoprism librephotos piwigo lychee googlephotos', ['image', 'images', 'camera']],
  ['paperlessngx paperless docspell stirlingpdf', ['file-text', 'scan-text', 'receipt']],
  ['freshrss miniflux tinytinyrss ttrss newsblur feedly', ['rss', 'newspaper']],
  ['homepage homarr dashy heimdall glance organizr', ['layout-dashboard']],
  ['mealie tandoor grocy', ['utensils', 'chef-hat', 'shopping-basket']],
  ['actualbudget actual fireflyiii ynab ghostfolio', ['wallet', 'piggy-bank', 'chart-candlestick']],
  ['karakeep hoarder shiori', ['bookmark']],
  ['bookstack wikijs outline docmost affine silverbullet dokuwiki logseq mkdocs trilium confluence', ['notebook-pen', 'book', 'library', 'notebook-text']],
  ['romm steam minecraft valheim satisfactory factorio terraria palworld foundryvtt zomboid vrising counterstrike pterodactyl crafty gameserver', ['gamepad-2', 'joystick', 'swords', 'server']],
  ['wordpress ghost drupal joomla strapi directus payload contentful sanity hugo jekyll gatsby', ['globe', 'file-code', 'newspaper']],

  // Home automation and things at home
  ['homeassistant hass hassio homebridge openhab domoticz hubitat smartthings zigbee zigbee2mqtt z2m zwave zwavejs matter esphome tuya', ['house', 'house-wifi', 'lightbulb', 'toggle-right', 'circuit-board']],
  ['frigate blueiris zoneminder shinobi scrypted unifiprotect reolink hikvision dahua wyze ring arlo nvr', ['cctv', 'camera', 'video']],
  ['ecobee nest tado', ['thermometer', 'heater']],
  ['roomba valetudo', ['robot-vacuum']],
  ['octoprint klipper mainsail fluidd bambu prusa 3dprinter 3dprinting', ['printer', 'spool', 'box']],
  ['tesla teslamate', ['car', 'ev-charger', 'battery-charging']],

  // Money and business
  ['stripe paypal braintree adyen lemonsqueezy paddle chargebee', ['credit-card', 'dollar-sign', 'banknote']],
  ['shopify woocommerce magento bigcommerce', ['store', 'shopping-cart']],
  ['quickbooks xero freshbooks invoiceninja', ['receipt', 'calculator']],
  ['hubspot salesforce pipedrive zoho', ['handshake', 'users']],
  ['ethereum solana monero xmr lightning btcpay umbrel', ['bitcoin', 'coins', 'wallet']],
];
