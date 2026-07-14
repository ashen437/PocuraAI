import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
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
 */
export function WorkspaceSetupOverlay({ enabled }: { enabled: boolean }) {
  const { t } = useI18n()
  const copy = t.workspaceSetup
  const onboarding = useStore($desktopOnboarding)

  const [status, setStatus] = useState<'checking' | 'hidden' | 'show'>('checking')
  const [suggested, setSuggested] = useState('')
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

        if (res?.dir) {
          setStatus('hidden')
        } else {
          setSuggested(res?.suggestedDir || res?.defaultLabel || '')
          setStatus('show')
        }
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

  const finish = async (dir: string) => {
    if (!dir.trim()) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await window.hermesDesktop.settings.setDefaultProjectDir(dir)
      setStatus('hidden')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const browse = async () => {
    setBusy(true)
    setError(null)

    try {
      const res = await window.hermesDesktop.settings.pickDefaultProjectDir()

      if (!res.canceled && res.dir) {
        await finish(res.dir)
      }
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

        <div className="mt-4 overflow-x-auto rounded-md border border-(--stroke-nous) px-3 py-2.5 font-mono text-[12px]">
          {suggested}
        </div>

        {error && (
          <p className="mt-2 text-xs text-destructive">
            {copy.errorTitle}: {error}
          </p>
        )}

        <p className="mt-4 text-xs text-muted-foreground">{copy.changeLater}</p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button disabled={busy} onClick={() => void browse()} size="sm" variant="ghost">
            {copy.browse}
          </Button>
          <Button disabled={busy} onClick={() => void finish(suggested)} size="sm" variant="default">
            {busy ? copy.saving : copy.useThis}
          </Button>
        </div>
      </div>
    </div>
  )
}
