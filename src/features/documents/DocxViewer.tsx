import { useEffect, useRef, useState } from 'react'

/** Рендерить .docx у браузері (docx-preview завантажується ліниво). */
export function DocxViewer({ source, onError }: { source: Blob | ArrayBuffer; onError?: (message: string) => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { renderAsync } = await import('docx-preview')
        if (cancelled || !bodyRef.current || !styleRef.current) return
        await renderAsync(source, bodyRef.current, styleRef.current, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          breakPages: true,
          useBase64URL: true,
        })
        if (!cancelled) setState('ready')
      } catch (e) {
        if (!cancelled) {
          setState('error')
          onError?.(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source, onError])

  return (
    <div className="docx-viewer" data-state={state}>
      {state === 'loading' && <p className="muted">Відображення документа…</p>}
      <div ref={styleRef} hidden />
      <div ref={bodyRef} className="docx-body" />
    </div>
  )
}
