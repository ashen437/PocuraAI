import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { openOrDownloadFile } from '@/lib/media'
import { notifyError } from '@/store/notifications'

export interface CreateReportResult {
  docxPath: string
  pdfPath: string
  title: string
}

/**
 * Parse a `create_report` tool result into the shape this card needs, or
 * `null` when it doesn't look like one (an error result, a still-streaming
 * partial result, or some other tool's payload that happens to share the
 * generic record shape). Callers fall through to the normal collapsible
 * tool-call renderer in that case, so this must fail closed.
 */
export function parseCreateReportResult(record: Record<string, unknown>): CreateReportResult | null {
  const docxPath = record.docx_path
  const pdfPath = record.pdf_path

  if (typeof docxPath !== 'string' || !docxPath || typeof pdfPath !== 'string' || !pdfPath) {
    return null
  }

  return {
    docxPath,
    pdfPath,
    title: typeof record.title === 'string' ? record.title : ''
  }
}

/** Dedicated card for a completed `create_report` tool call: title + two
 *  buttons that open (locally) or download (remote gateway) the generated
 *  .docx/.pdf, reusing the same open/download branch the Artifacts panel
 *  uses (`openOrDownloadFile`) rather than a generic collapsible JSON view. */
export function CreateReportCard({ report }: { report: CreateReportResult }) {
  const { t } = useI18n()
  const copy = t.assistant.tool
  const [busy, setBusy] = useState<'docx' | 'pdf' | null>(null)

  const open = async (kind: 'docx' | 'pdf', path: string) => {
    setBusy(kind)

    try {
      await openOrDownloadFile(path)
    } catch (err) {
      notifyError(err, copy.reportOpenFailed)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-3">
      <div className="flex items-center gap-2">
        <Codicon className="shrink-0 text-(--ui-text-secondary)" name="pie-chart" size="1rem" />
        <span className="min-w-0 truncate text-sm font-medium" title={report.title || copy.reportReady}>
          {report.title || copy.reportReady}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          disabled={busy !== null}
          onClick={() => void open('docx', report.docxPath)}
          size="sm"
          type="button"
          variant="textStrong"
        >
          <Codicon name="file-text" size="0.8125rem" />
          {copy.openWord}
        </Button>
        <Button
          disabled={busy !== null}
          onClick={() => void open('pdf', report.pdfPath)}
          size="sm"
          type="button"
          variant="textStrong"
        >
          <Codicon name="file-pdf" size="0.8125rem" />
          {copy.openPdf}
        </Button>
      </div>
    </div>
  )
}
