import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { $browserLiveViewOpen, $browserLiveViewSessionId, closeBrowserLiveView } from '@/store/browser-live-view'
import { $gateway } from '@/store/gateway'

import { subscribeScreencastFrames } from './screencast-stream'

/** Floating picture-in-picture pane showing the agent's browser live, frame by
 *  frame, the way Claude Code's browser tool shows its actions. Deliberately
 *  NOT part of the pane-grid/right-rail tab system -- it's a lightweight
 *  overlay so it can pop up over whatever the user is looking at the moment a
 *  browser tool starts, and canvas painting happens straight from the
 *  screencast-stream subscription (bypassing React state) so a multi-frame-
 *  per-second stream doesn't thrash re-renders. */
export function BrowserLiveViewPane() {
  const { t } = useI18n()
  const open = useStore($browserLiveViewOpen)
  const sessionId = useStore($browserLiveViewSessionId)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hasFrame, setHasFrame] = useState(false)

  useEffect(() => {
    if (!open || !sessionId) {
      return
    }

    setHasFrame(false)

    const img = new Image()
    let cancelled = false

    img.onload = () => {
      if (cancelled) {
        return
      }

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')

      if (!canvas || !ctx) {
        return
      }

      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
      }

      ctx.drawImage(img, 0, 0)
      setHasFrame(true)
    }

    const unsubscribe = subscribeScreencastFrames((sid, frame) => {
      if (sid !== sessionId || cancelled) {
        return
      }

      img.src = `data:image/jpeg;base64,${frame.data}`
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [open, sessionId])

  useEffect(() => {
    if (open || !sessionId) {
      return
    }

    void $gateway.get()?.request('browser.screencast.stop', { session_id: sessionId })
  }, [open, sessionId])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-80 flex-col overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-editor-surface-background) shadow-xl [-webkit-app-region:no-drag]"
      role="dialog"
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pl-2.5 pr-1.5">
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-(--ui-text-tertiary)">
          <Codicon className="text-(--ui-text-tertiary)" name="globe" size="0.75rem" />
          {t.browserLiveView.title}
        </span>
        <button
          aria-label={t.common.close}
          className="grid size-6 place-items-center rounded-md text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
          onClick={closeBrowserLiveView}
          type="button"
        >
          <Codicon name="close" size="0.75rem" />
        </button>
      </div>
      <div className="relative aspect-video w-full bg-black">
        <canvas className="size-full object-contain" ref={canvasRef} />
        {!hasFrame && (
          <div className="absolute inset-0 grid place-items-center text-[0.6875rem] text-white/60">
            {t.browserLiveView.connecting}
          </div>
        )}
      </div>
    </div>
  )
}
