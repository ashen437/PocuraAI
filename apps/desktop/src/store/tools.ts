import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'
import { TOOL_SESSION_SOURCE_IDS } from '@/lib/session-source'

/**
 * The tools rail (left of the sidebar) picks a *mode*, not a view: the chat
 * pane and composer are identical in every mode. What changes is which
 * sessions the sidebar lists and which `source` a new session is created
 * with — so each tool keeps its own history instead of mixing into recents.
 *
 * `null` is general Chat (the default): ordinary desktop sessions, with every
 * tool's sessions excluded from the list.
 */
export type ToolId = (typeof TOOL_SESSION_SOURCE_IDS)[number]
export type ActiveTool = null | ToolId

const ACTIVE_TOOL_KEY = 'pocura.activeTool'

const isToolId = (value: null | string): value is ToolId =>
  value != null && (TOOL_SESSION_SOURCE_IDS as readonly string[]).includes(value)

// Persisted so a restart doesn't silently drop the user back into general Chat
// while they're mid-way through a procurement job. An unknown/stale id (tool
// removed between versions) falls back to Chat rather than pinning the sidebar
// to a source that no longer exists.
const initialTool = (): ActiveTool => {
  const stored = storedString(ACTIVE_TOOL_KEY)

  return isToolId(stored) ? stored : null
}

export const $activeTool = atom<ActiveTool>(initialTool())

export const setActiveTool = (tool: ActiveTool) => {
  $activeTool.set(tool)
  persistString(ACTIVE_TOOL_KEY, tool)
}

/** The session `source` to create new sessions with for the active tool.
 *  General Chat keeps the historical 'desktop' source. */
export const sessionSourceForTool = (tool: ActiveTool): string => tool ?? 'desktop'
