import { useStore } from '@nanostores/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { $connection, $currentCwd } from '@/store/session'

import { useFileDropZone } from '../chat/hooks/use-file-drop-zone'
import type { DroppedFile } from '../chat/hooks/use-composer-actions'
import { useGatewayRequest } from '../gateway/hooks/use-gateway-request'
import { SETTINGS_ROUTE, sessionRoute } from '../routes'
import { uploadComposerAttachment } from '../session/hooks/use-prompt-actions'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

/**
 * How the agent is told to read a batch of tender documents.
 *
 * Kept as a single constant so it can be tuned against real tender packs
 * without touching the upload/session plumbing below. The citation and
 * "say when it's missing" rules are the load-bearing part: procurement answers
 * get acted on, so an invented deadline is worse than an admitted gap.
 */
export const TENDER_ANALYSIS_PREAMBLE = [
  'You are analysing a batch of tender / procurement documents attached below.',
  '',
  'Ground every statement in the attached documents. Where relevant, cover:',
  '- Scope of work and deliverables',
  '- Key dates: issue, clarification, submission deadline, validity period',
  '- Eligibility and qualification criteria',
  '- Pricing and commercial terms (currency, taxes, payment schedule)',
  '- Compliance and submission requirements (formats, copies, mandatory forms)',
  '',
  'Rules:',
  '- Cite the source file name for every fact you state.',
  '- If something is missing, ambiguous, or contradictory across documents, say so',
  '  explicitly instead of inferring or filling the gap.',
  '- Quote exact figures, dates and clause references rather than paraphrasing them.',
  '- Some documents may be scans; their text comes from OCR and can contain errors.',
  '  Flag anything that looks like an OCR artefact rather than silently correcting it.',
  ''
].join('\n')

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'])

const isImagePath = (path: string) => {
  const dot = path.lastIndexOf('.')

  return dot === -1 ? false : IMAGE_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

const fileLabel = (path: string) => path.split(/[\\/]/).pop() || path

interface PickedFile {
  id: string
  path: string
  label: string
  isImage: boolean
}

const toPicked = (path: string): PickedFile => ({
  id: `${path}:${crypto.randomUUID()}`,
  path,
  label: fileLabel(path),
  isImage: isImagePath(path)
})

interface TenderAnalyzeViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function TenderAnalyzeView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: TenderAnalyzeViewProps) {
  const { t } = useI18n()
  const copy = t.tenderAnalyze
  const navigate = useNavigate()
  const { requestGateway } = useGatewayRequest()
  const connection = useStore($connection)
  const currentCwd = useStore($currentCwd)

  const [files, setFiles] = useState<PickedFile[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const remote = connection?.mode === 'remote'
  // Attachments are staged into the session workspace, so a session with no
  // user-chosen workspace has nowhere to put them — the gateway rejects the
  // attach outright rather than silently defaulting to the home directory.
  // Gate the whole view on it instead of failing at upload time.
  const workspace = currentCwd.trim()

  const addFiles = useCallback((paths: string[]) => {
    if (!paths.length) {
      return
    }

    setError(null)
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.path))

      return [...prev, ...paths.filter(p => p && !seen.has(p)).map(toPicked)]
    })
  }, [])

  const onDropFiles = useCallback(
    (dropped: DroppedFile[]) => {
      addFiles(dropped.filter(d => !d.isDirectory).map(d => d.path))
    },
    [addFiles]
  )

  const { dragKind, dropHandlers } = useFileDropZone({ enabled: !busy && Boolean(workspace), onDropFiles })

  const onBrowse = useCallback(() => fileInputRef.current?.click(), [])

  const onPickFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files || [])
        .map(f => window.hermesDesktop?.getPathForFile?.(f) || '')
        .filter(Boolean)

      addFiles(picked)
      event.target.value = ''
    },
    [addFiles]
  )

  const removeFile = useCallback((id: string) => setFiles(prev => prev.filter(f => f.id !== id)), [])
  const clearFiles = useCallback(() => {
    setFiles([])
    setError(null)
  }, [])

  const canAnalyze = Boolean(workspace) && files.length > 0 && question.trim().length > 0 && !busy

  const analyze = useCallback(async () => {
    if (!canAnalyze) {
      return
    }

    setBusy(true)
    setError(null)

    let sessionId: string | null = null

    try {
      const created = await requestGateway<{ session_id: string; stored_session_id?: null | string }>(
        'session.create',
        { cols: 96, cwd: workspace, source: 'desktop' }
      )

      sessionId = created.session_id

      // Stage every file into the session workspace. uploadComposerAttachment
      // owns the local-vs-remote split (path vs uploaded bytes) and routes
      // images to image.attach (vision tiles) and everything else to
      // file.attach (an @file: ref the agent reads via read_file, which is
      // where the OCR/extraction chain lives). Reusing it keeps this view in
      // lockstep with the composer instead of duplicating that logic.
      const refs: string[] = []

      for (const file of files) {
        const attached = await uploadComposerAttachment(
          {
            id: file.id,
            kind: file.isImage ? 'image' : 'file',
            label: file.label,
            path: file.path
          },
          { remote, requestGateway, sessionId }
        ).catch((err: unknown) => {
          throw new Error(err instanceof Error ? err.message : copy.uploadFailed(file.label))
        })

        if (attached.refText) {
          refs.push(attached.refText)
        } else if (attached.path) {
          // Images have no @file: ref — they ride along as vision tiles. Name
          // the path anyway so the agent can read_file it for OCR text when
          // the visual read is ambiguous (small print, dense scans).
          refs.push(`@file:${attached.path}`)
        }
      }

      const prompt = `${TENDER_ANALYSIS_PREAMBLE}\nQuestion: ${question.trim()}\n\n${refs.join(' ')}`

      // Fire-and-forget: prompt.submit resolves when the turn COMPLETES, so
      // awaiting it would pin this view open for the whole answer. Navigate
      // straight to the chat and let the normal streaming UI take over.
      void requestGateway('prompt.submit', { session_id: sessionId, prompt }).catch(() => undefined)

      navigate(sessionRoute(created.stored_session_id || created.session_id))
    } catch (err) {
      if (sessionId) {
        void requestGateway('session.close', { session_id: sessionId }).catch(() => undefined)
      }

      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }, [canAnalyze, copy, files, navigate, question, remote, requestGateway, workspace])

  const fileList = useMemo(
    () =>
      files.map(file => (
        <li
          className="flex items-center gap-2 rounded-md border border-(--stroke-nous) px-2.5 py-1.5 text-xs"
          key={file.id}
        >
          <Codicon
            className="shrink-0 text-muted-foreground"
            name={file.isImage ? 'file-media' : 'file'}
            size="0.875rem"
          />
          <span className="min-w-0 flex-1 truncate">{file.label}</span>
          <button
            aria-label={copy.remove(file.label)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={() => removeFile(file.id)}
            type="button"
          >
            <Codicon name="close" size="0.75rem" />
          </button>
        </li>
      )),
    [busy, copy, files, removeFile]
  )

  if (!workspace) {
    return (
      <section className="flex h-full items-center justify-center p-6" {...props}>
        <div className="max-w-md rounded-xl border border-(--stroke-nous) bg-card p-8 text-center">
          <Codicon className="text-muted-foreground" name="folder-opened" size="1.5rem" />
          <h2 className="mt-3 text-lg font-semibold tracking-tight">{copy.noWorkspaceTitle}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{copy.noWorkspaceDesc}</p>
          <Button className="mt-4" onClick={() => navigate(SETTINGS_ROUTE)} size="sm">
            {copy.chooseWorkspace}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full flex-col gap-4 overflow-y-auto p-6" {...dropHandlers} {...props}>
      <header className="shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.subtitle}</p>
      </header>

      <button
        className={`flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-8 transition-colors ${
          dragKind === 'files' ? 'border-primary bg-primary/5' : 'border-(--stroke-nous) hover:border-primary/50'
        }`}
        disabled={busy}
        onClick={onBrowse}
        type="button"
      >
        <Codicon className="text-muted-foreground" name="cloud-upload" size="1.25rem" />
        <span className="text-sm font-medium">{copy.dropTitle}</span>
        <span className="max-w-md text-center text-xs text-muted-foreground">{copy.dropHint}</span>
      </button>

      <input className="hidden" multiple onChange={onPickFiles} ref={fileInputRef} type="file" />

      {files.length > 0 && (
        <div className="shrink-0">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{copy.fileCount(files.length)}</span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={busy}
              onClick={clearFiles}
              type="button"
            >
              {copy.clear}
            </button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">{fileList}</ul>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-1.5">
        <label className="text-xs font-medium" htmlFor="tender-question">
          {copy.questionLabel}
        </label>
        <textarea
          className="min-h-24 resize-y rounded-md border border-(--stroke-nous) bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
          disabled={busy}
          id="tender-question"
          onChange={event => setQuestion(event.target.value)}
          placeholder={copy.questionPlaceholder}
          value={question}
        />
      </div>

      {error && (
        <p className="shrink-0 text-xs text-destructive">
          {copy.errorTitle}: {error}
        </p>
      )}

      <div className="flex shrink-0 justify-end">
        <Button disabled={!canAnalyze} onClick={() => void analyze()} size="sm">
          {busy ? copy.analyzing : copy.analyze}
        </Button>
      </div>
    </section>
  )
}
