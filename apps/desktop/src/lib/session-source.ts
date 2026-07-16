import { normalize } from '@/lib/text'

const SOURCE_LABELS: Record<string, string> = {
  api_server: 'API',
  bluebubbles: 'iMessage',
  cli: 'CLI',
  codex: 'Codex',
  desktop: 'Desktop',
  discord: 'Discord',
  email: 'Email',
  gateway: 'Gateway',
  local: 'Local',
  matrix: 'Matrix',
  mattermost: 'Mattermost',
  qqbot: 'QQ',
  signal: 'Signal',
  slack: 'Slack',
  sms: 'SMS',
  telegram: 'Telegram',
  'tender-analyze': 'Tender Analyze',
  tui: 'TUI',
  webhook: 'Webhook',
  weixin: 'WeChat',
  whatsapp: 'WhatsApp',
  yuanbao: 'Yuanbao'
}

const SOURCE_ALIASES: Record<string, string[]> = {
  bluebubbles: ['apple messages', 'imessage'],
  cli: ['terminal'],
  desktop: ['app', 'gui'],
  local: ['machine'],
  qqbot: ['qq'],
  telegram: ['tg'],
  tui: ['terminal'],
  weixin: ['wechat'],
  whatsapp: ['wa']
}

// Desktop "tool" sources. A tool session is an ordinary desktop chat — same
// composer, same streaming — that carries its own source so its history is a
// separate list in the sidebar instead of mixing into recents. This is the
// mechanism cron already uses (see SessionSourceFilter in hermes.ts).
//
// Adding a tool means: an id here, a matching source constant in
// tui_gateway/server.py (_DESKTOP_OWNED_SOURCES — miss it and the tool's
// sessions silently regain the home-directory fallback), a SOURCE_LABELS
// entry above, and a rail entry in app/tools-rail.
export const TOOL_SESSION_SOURCE_IDS = ['tender-analyze']
const TOOL_SOURCE_IDS = new Set(TOOL_SESSION_SOURCE_IDS)

/** True when a source belongs to a desktop tool (Tender Analyze, …) rather
 *  than general chat — i.e. its sessions live in that tool's own history. */
export function isToolSource(source: null | string | undefined): boolean {
  const id = normalizeSessionSource(source)

  return id != null && TOOL_SOURCE_IDS.has(id)
}

// Sources that run on the local machine rather than an external messaging
// platform. A handoff *from* one of these isn't a platform origin worth a badge.
// Exported so the recents fetch can keep these in the main list while the
// messaging fetch excludes them.
export const LOCAL_SESSION_SOURCE_IDS = [
  'cli',
  'codex',
  'desktop',
  'gateway',
  'local',
  'tui',
  ...TOOL_SESSION_SOURCE_IDS
]
const LOCAL_SOURCE_IDS = new Set(LOCAL_SESSION_SOURCE_IDS)

// External messaging platforms that each get their own self-managed sidebar
// section (fetched separately from local recents). Mirrors the gateway platform
// adapters; keep in sync with PLATFORM_ICONS in app/messaging/platform-icon.tsx.
export const MESSAGING_SESSION_SOURCE_IDS = [
  'telegram',
  'discord',
  'slack',
  'mattermost',
  'matrix',
  'signal',
  'whatsapp',
  'bluebubbles',
  'homeassistant',
  'email',
  'sms',
  'webhook',
  'api_server',
  'weixin',
  'wecom',
  'qqbot',
  'yuanbao',
  'dingtalk',
  'feishu'
]
const MESSAGING_SOURCE_IDS = new Set(MESSAGING_SESSION_SOURCE_IDS)

/** True when a source id is an external messaging platform (gets its own
 *  sidebar section) rather than a local/CLI/desktop session. */
export function isMessagingSource(source: null | string | undefined): boolean {
  const id = normalizeSessionSource(source)

  return id != null && MESSAGING_SOURCE_IDS.has(id)
}

export function normalizeSessionSource(source: null | string | undefined): string | null {
  return normalize(source) || null
}

/**
 * Resolve the origin messaging platform for a handed-off session. Returns the
 * normalized platform id (e.g. 'telegram') when the session completed a handoff
 * from a real messaging platform, otherwise null. After a handoff the live
 * source is local, so this is what drives the row's origin-platform badge.
 */
export function handoffOriginSource(
  handoffState: null | string | undefined,
  handoffPlatform: null | string | undefined
): string | null {
  if (handoffState !== 'completed') {
    return null
  }

  const id = normalizeSessionSource(handoffPlatform)

  if (!id || LOCAL_SOURCE_IDS.has(id)) {
    return null
  }

  return id
}

export function sessionSourceLabel(source: null | string | undefined): string | null {
  const id = normalizeSessionSource(source)

  if (!id) {
    return null
  }

  return SOURCE_LABELS[id] || id.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export function sessionSourceSearchTerms(source: null | string | undefined): string[] {
  const id = normalizeSessionSource(source)
  const label = sessionSourceLabel(id)

  if (!id) {
    return []
  }

  return [id, label ?? '', ...(SOURCE_ALIASES[id] ?? [])].filter(Boolean)
}
