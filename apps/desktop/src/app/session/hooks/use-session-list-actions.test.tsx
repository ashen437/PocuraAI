// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllProfileSessions, type SessionInfo } from '@/hermes'
import { $pinnedSessionIds } from '@/store/layout'
import { ALL_PROFILES } from '@/store/profile'
import { $sessions, setSessions } from '@/store/session'
import { setActiveTool } from '@/store/tools'

import { useSessionListActions } from './use-session-list-actions'

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCronJobs: vi.fn(async () => []),
  listAllProfileSessions: vi.fn()
}))

const mockList = vi.mocked(listAllProfileSessions)

function session(id: string, source: string): SessionInfo {
  return {
    ended_at: null,
    id,
    input_tokens: 0,
    is_active: false,
    message_count: 4,
    output_tokens: 0,
    preview: '',
    profile: 'default',
    source,
    started_at: 0,
    title: id
  } as SessionInfo
}

const CHAT_ROWS = [session('chat-1', 'desktop'), session('chat-2', 'desktop')]
const TENDER_ROWS = [session('tender-1', 'tender-analyze')]

/** Serve rows matching whatever source filter the hook asked for, the way the
 *  real gateway would. */
function serveBySourceFilter() {
  mockList.mockImplementation(async (...args: unknown[]) => {
    const filter = args[5] as { excludeSources?: string[]; source?: string } | undefined
    const rows = filter?.source === 'tender-analyze' ? TENDER_ROWS : CHAT_ROWS

    return { offset: 0, profile_totals: {}, sessions: rows, total: rows.length } as Awaited<
      ReturnType<typeof listAllProfileSessions>
    >
  })
}

describe('useSessionListActions — rail mode scoping', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveTool(null)
    setSessions([])
    $pinnedSessionIds.set([])
    mockList.mockReset()
    serveBySourceFilter()
  })

  afterEach(() => {
    setActiveTool(null)
    $pinnedSessionIds.set([])
  })

  it('asks the gateway for only the active tool’s source', async () => {
    const { result } = renderHook(() => useSessionListActions({ profileScope: ALL_PROFILES }))

    // refreshSessions also kicks off the cron + messaging slices, which hit the
    // same API — the recents fetch is the first call of each refresh.
    const recentsFilter = () => mockList.mock.calls[0]?.[5]

    await result.current.refreshSessions()
    expect(recentsFilter()).toMatchObject({ excludeSources: expect.arrayContaining(['tender-analyze']) })

    mockList.mockClear()
    setActiveTool('tender-analyze')
    await result.current.refreshSessions()
    expect(recentsFilter()).toEqual({ source: 'tender-analyze' })
  })

  it('replaces the list on a mode switch instead of bleeding rows across modes', async () => {
    // The regression this guards: mergeSessionPage intentionally preserves
    // previous rows the server omitted (pinned / in-flight / active). Across a
    // mode switch those are precisely the *other* mode's chats, so merging
    // would leave normal chats sitting in the Tender Analyze list.
    const { result } = renderHook(() => useSessionListActions({ profileScope: ALL_PROFILES }))

    await result.current.refreshSessions()
    expect($sessions.get().map(s => s.id)).toEqual(['chat-1', 'chat-2'])

    // Pin a normal chat — a pinned row is exactly what mergeSessionPage keeps.
    $pinnedSessionIds.set(['chat-1'])

    setActiveTool('tender-analyze')
    await result.current.refreshSessions()

    expect($sessions.get().map(s => s.id)).toEqual(['tender-1'])
    expect($sessions.get().every(s => s.source === 'tender-analyze')).toBe(true)

    // …and back the other way.
    setActiveTool(null)
    await result.current.refreshSessions()
    expect($sessions.get().map(s => s.id)).toEqual(['chat-1', 'chat-2'])
  })

  it('clears the previous mode’s rows immediately, not when the fetch lands', async () => {
    // The lag this guards: $sessions drives the rendered list, so leaving the
    // old mode's rows in place across the (async) fetch flashes the wrong
    // mode's chats for a second or two before "fixing itself".
    const { result } = renderHook(() => useSessionListActions({ profileScope: ALL_PROFILES }))

    await result.current.refreshSessions()
    expect($sessions.get().map(s => s.id)).toEqual(['chat-1', 'chat-2'])

    // Hold the next fetch open so we can observe the list mid-flight.
    let release: (() => void) | undefined
    const inFlight = new Promise<void>(resolve => {
      release = resolve
    })

    mockList.mockImplementation(async () => {
      await inFlight

      return { offset: 0, profile_totals: {}, sessions: TENDER_ROWS, total: TENDER_ROWS.length } as Awaited<
        ReturnType<typeof listAllProfileSessions>
      >
    })

    setActiveTool('tender-analyze')
    const pending = result.current.refreshSessions()

    // Fetch has NOT resolved yet — the stale normal chats must already be gone.
    expect($sessions.get()).toEqual([])

    release?.()
    await pending
    expect($sessions.get().map(s => s.id)).toEqual(['tender-1'])
  })

  it('still merges (not replaces) while paging within one mode', async () => {
    // Paging must keep mergeSessionPage's preservation behaviour — the scope
    // hasn't changed, so an in-flight/pinned row the page omits must survive.
    const { result } = renderHook(() => useSessionListActions({ profileScope: ALL_PROFILES }))

    await result.current.refreshSessions()

    setSessions([...CHAT_ROWS, session('chat-pinned-old', 'desktop')])
    $pinnedSessionIds.set(['chat-pinned-old'])

    await result.current.refreshSessions()

    expect($sessions.get().map(s => s.id)).toContain('chat-pinned-old')
  })
})
