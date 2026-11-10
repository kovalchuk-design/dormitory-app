import { useCallback, useEffect, useState } from 'react'
import { downloadBlob, downloadFile, signedUrl } from './api'
import { DocxViewer } from './DocxViewer'
import type { FileType } from './types'

interface Props {
  storagePath: string
  title: string
  fileType: FileType
  /** Кнопка «Завантажити» над переглядом (у перегляді шаблону не потрібна). */
  downloadable?: boolean
}

/** Перегляд без завантаження: .docx — docx-preview, PDF — власний переглядач браузера (iframe). */
export function PreviewPane({ storagePath, title, fileType, downloadable = true }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (fileType === 'docx') {
          const b = await downloadBlob(storagePath)
          if (!cancelled) setBlob(b)
        } else if (fileType === 'pdf') {
          const u = await signedUrl(storagePath)
          if (!cancelled) setPdfUrl(u)
        } else if (!cancelled) {
          setError('Для цього типу файлу перегляд недоступний.')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storagePath, fileType])

  const onRenderError = useCallback((m: string) => setError(`Не вдалося відобразити документ (${m}).`), [])

  async function download() {
    setDownloadError(null)
    try {
      await downloadFile(storagePath, title)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="preview-pane">
      {downloadable && (
        <div className="preview-actions">
          <button type="button" className="secondary" onClick={() => void download()}>
            Завантажити
          </button>
        </div>
      )}
      {downloadError && <p className="error">{downloadError}</p>}
      {error ? (
        <div className="preview-fallback" role="alert">
          <p>{error}</p>
          <p className="muted">Ви можете завантажити файл і відкрити його у Word або іншій програмі.</p>
          <button type="button" onClick={() => void download()}>Завантажити файл</button>
        </div>
      ) : fileType === 'docx' ? (
        blob ? <DocxViewer source={blob} onError={onRenderError} /> : <p className="muted">Завантаження…</p>
      ) : fileType === 'pdf' ? (
        pdfUrl ? <iframe className="pdf-frame" src={pdfUrl} title={`Перегляд: ${title}`} /> : <p className="muted">Завантаження…</p>
      ) : null}
    </div>
  )
}
