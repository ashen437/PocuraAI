// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { isToolSource, LOCAL_SESSION_SOURCE_IDS, TOOL_SESSION_SOURCE_IDS } from '@/lib/session-source'
import { $activeTool, sessionSourceForTool, setActiveTool } from '@/store/tools'

describe('tools rail — session scoping', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveTool(null)
  })

  it('defaults to general Chat', () => {
    expect($activeTool.get()).toBeNull()
  })

  it('creates new sessions under the active tool’s source', () => {
    // This mapping is what keeps each tool's history separate AND what the
    // backend keys its per-tool system prompt off (_tool_ephemeral_prompt in
    // tui_gateway/server.py). Breaking it silently merges tender chats back
    // into general recents and drops the procurement framing.
    expect(sessionSourceForTool(null)).toBe('desktop')
    expect(sessionSourceForTool('tender-analyze')).toBe('tender-analyze')
  })

  it('persists the active tool across reloads', () => {
    setActiveTool('tender-analyze')
    expect($activeTool.get()).toBe('tender-analyze')
    expect(localStorage.getItem('pocura.activeTool')).toBe('tender-analyze')

    setActiveTool(null)
    expect(localStorage.getItem('pocura.activeTool')).toBeNull()
  })

  it('classifies every tool source as a tool, and desktop as not one', () => {
    for (const id of TOOL_SESSION_SOURCE_IDS) {
      expect(isToolSource(id)).toBe(true)
    }

    expect(isToolSource('desktop')).toBe(false)
    expect(isToolSource('cron')).toBe(false)
    expect(isToolSource(null)).toBe(false)
  })

  it('treats tool sources as local, so they never leak into the messaging slice', () => {
    // MESSAGING_EXCLUDED_SOURCES is built from LOCAL_SESSION_SOURCE_IDS. A tool
    // source missing here would surface tender chats as a "messaging platform"
    // section in the sidebar.
    for (const id of TOOL_SESSION_SOURCE_IDS) {
      expect(LOCAL_SESSION_SOURCE_IDS).toContain(id)
    }
  })
})
