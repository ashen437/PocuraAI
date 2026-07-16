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

  describe('a session is visible in exactly one mode', () => {
    // The rule the rail has to guarantee: given a session's source, exactly one
    // rail mode may show it. Every list that can surface a session (sidebar
    // recents, sidebar search, command palette) filters through this same
    // predicate shape, so proving it here covers all of them.
    const visibleInMode = (source: string, tool: null | string) =>
      tool ? source === tool : !isToolSource(source)

    const MODES = [null, ...TOOL_SESSION_SOURCE_IDS]

    it.each(['desktop', 'tender-analyze', 'telegram', 'cron'])('source %s shows in exactly one mode', source => {
      const modesShowing = MODES.filter(mode => visibleInMode(source, mode))

      expect(modesShowing).toHaveLength(1)
    })

    it('never shows a tool session in general Chat', () => {
      for (const id of TOOL_SESSION_SOURCE_IDS) {
        expect(visibleInMode(id, null)).toBe(false)
      }
    })

    it('never shows a non-tool session inside a tool mode', () => {
      for (const id of TOOL_SESSION_SOURCE_IDS) {
        expect(visibleInMode('desktop', id)).toBe(false)
        expect(visibleInMode('telegram', id)).toBe(false)
      }
    })
  })
})
