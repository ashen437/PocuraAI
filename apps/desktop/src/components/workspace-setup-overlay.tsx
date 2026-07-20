import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { $desktopOnboarding } from '@/store/onboarding'

/**
 * WorkspaceSetupOverlay
 *
 * One-time first-run step: lets the user pick where Pocura stores files it
 * uploads, creates, or edits, instead of silently defaulting to the OS home
 * directory (see resolveHermesCwd() in electron/main.ts). Shows once, after
 * the provider-onboarding overlay clears, and never again once a project
 * directory is persisted -- readDefaultProjectDir() returning non-null on a
 * later launch is itself the "already done" signal, so no separate
 * skip/seen flag is needed.
 *
 * Browse-only by design: an earlier version also showed the suggested path in
 * a bordered, monospace box with a one-click "Use this folder" button. That
 * box wasn't editable, but its styling read as a text field the user was
 * meant to type into, and it competed with the actual folder-browser action.
 * There is exactly one control now -- "Browse for folder" -- which opens the
 * native OS directory dialog (main.ts's `defaultProjectDir:pick` handler,
 * itself defaulted to the suggested location) so the user always picks a
 * real folder on disk rather than typing or accepting a name they can't see.
 */
export function WorkspaceSetupOverlay({ enabled }: { enabled: boolean }) {
  const { t } = useI18n()
  const copy = t.workspaceSetup
  const onboarding = useStore($desktopOnboarding)

  const [status, setStatus] = useState<'checking' | 'hidden' | 'show'>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wait for onboarding (provider setup) to clear its own gate before
  // checking -- showing both overlays' readiness probes at once is harmless,
  // but sequencing them keeps the first-run experience to one prompt at a time.
  const onboardingSettled = onboarding.manual || onboarding.configured === true || onboarding.firstRunSkipped

  useEffect(() => {
    if (!enabled || !onboardingSettled || status !== 'checking') {
      return
    }

    let cancelled = false

    window.hermesDesktop?.settings
      ?.getDefaultProjectDir?.()
      .then(res => {
        if (cancelled) {
          return
        }

        setStatus(res?.dir ? 'hidden' : 'show')
      })
      .catch(() => {
        // No bridge (tests / older build) -- stay out of the way.
        if (!cancelled) {
          setStatus('hidden')
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, onboardingSettled, status])

  if (status !== 'show') {
    return null
  }

  const browse = async () => {
    setBusy(true)
    setError(null)

    try {
      const picked = await window.hermesDesktop.settings.pickDefaultProjectDir()

      if (picked.canceled || !picked.dir) {
        return
      }

      await window.hermesDesktop.settings.setDefaultProjectDir(picked.dir)
      setStatus('hidden')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-1300 flex items-center justify-center bg-(--ui-chat-surface-background) p-6">
      <div className="w-full max-w-lg rounded-xl border border-(--stroke-nous) bg-card p-8 shadow-nous">
        <BrandMark className="size-11 shrink-0" />
        <h2 className="mt-4 text-xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.description}</p>

        {error && (
          <p className="mt-3 text-xs text-destructive">
            {copy.errorTitle}: {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{copy.changeLater}</p>
          <Button disabled={busy} onClick={() => void browse()} size="sm" variant="default">
            <Codicon name="folder-opened" size="0.875rem" />
            {busy ? copy.browsing : copy.browse}
          </Button>
        </div>
      </div>
    </div>
  )
}
