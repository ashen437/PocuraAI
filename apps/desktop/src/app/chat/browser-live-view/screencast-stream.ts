// Live agent-browser frames, pushed from the backend as `browser.screencast.frame`
// events (see tui_gateway `browser.screencast.start`, tools/browser_supervisor.py
// CDPSupervisor.start_screencast). Routed straight to whichever pane is watching
// the session — no polling, no store-driven re-render per frame (frames can
// arrive several times a second; running them through React state would thrash
// every subscriber of that state on every frame).

export interface ScreencastFrame {
  data: string // base64-encoded JPEG (CDP Page.screencastFrame's `data` field)
  metadata?: { deviceWidth?: number; deviceHeight?: number; [key: string]: unknown }
}

type Listener = (sessionId: string, frame: ScreencastFrame) => void

const listeners = new Set<Listener>()

/** The live-view pane subscribes once and filters by session id itself, so a
 *  frame arriving before the pane has picked a session isn't lost to a
 *  registration race. Returns an idempotent unsubscribe. */
export function subscribeScreencastFrames(listener: Listener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** Called from the gateway event dispatcher for every incoming screencast frame. */
export function writeScreencastFrame(sessionId: string, frame: ScreencastFrame): void {
  if (!sessionId || !frame?.data) {
    return
  }

  for (const listener of listeners) {
    listener(sessionId, frame)
  }
}
