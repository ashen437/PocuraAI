import { atom } from 'nanostores'

// Open/closed + which session's agent browser the floating live-view pane is
// currently watching. A plain atom, not persisted -- the pane always starts
// closed on launch and only opens when a browser tool actually runs (or the
// user opens it manually), never carries a stale "was open" state across
// restarts when no browser session exists yet.
export const $browserLiveViewOpen = atom(false)
export const $browserLiveViewSessionId = atom<string | null>(null)

// Sessions we've already asked the gateway to start streaming for. Guards
// against re-issuing browser.screencast.start on every subsequent tool call
// within the same turn (the RPC is idempotent server-side too, but there's no
// reason to round-trip it repeatedly).
const screencastingSessions = new Set<string>()

export function openBrowserLiveView(sessionId: string): void {
  $browserLiveViewSessionId.set(sessionId)
  $browserLiveViewOpen.set(true)
}

export function closeBrowserLiveView(): void {
  $browserLiveViewOpen.set(false)
}

export function hasRequestedScreencast(sessionId: string): boolean {
  return screencastingSessions.has(sessionId)
}

export function markScreencastRequested(sessionId: string): void {
  screencastingSessions.add(sessionId)
}

export function clearScreencastRequested(sessionId: string): void {
  screencastingSessions.delete(sessionId)
}
