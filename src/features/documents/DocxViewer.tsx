import { useCallback, useEffect, useRef, useState } from 'react'
import { loadChunk } from './lazy'

/** docx-preview ігнорує від’ємний відступ таблиці (w:tblInd), через що широка таблиця виходить за сторінку. Повертаємо його вручну. */
async function applyTableIndents(source: Blob | ArrayBuffer, container: HTMLElement) {
  const buf = source instanceof Blob ? await source.arrayBuffer() : source
  const { default: PizZip } = await loadChunk(() => import('pizzip'))
  const xml = new PizZip(buf).file('word/document.xml')?.asText() ?? ''
  const tables = [...container.querySelectorAll<HTMLElement>('section.docx table')]
  xml
    .split('<w:tbl>')
    .slice(1)
    .forEach((part, i) => {
      const m = /<w:tblPr>[\s\S]*?<w:tblInd w:w="(-\d+)"/.exec(part.slice(0, part.indexOf('</w:tblPr>') + 10))
      if (m && tables[i]) tables[i].style.marginLeft = `${(Number(m[1]) / 1440) * 96}px`
    })
}

/** Рендерить .docx у браузері (docx-preview завантажується ліниво). */
export function DocxViewer({ source, onError }: { source: Blob | ArrayBuffer; onError?: (message: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  /** Зменшує сторінку, щоб вона вміщалась по ширині (лишаються поля навколо). */
  const fit = useCallback(() => {
    const root = rootRef.current
    const wrapper = bodyRef.current?.querySelector<HTMLElement>('.docx-wrapper')
    const page = bodyRef.current?.querySelector<HTMLElement>('section.docx')
    if (!root || !wrapper || !page) return
    wrapper.style.zoom = '1'
    const cs = getComputedStyle(root)
    const free = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const scale = Math.min(1, free / page.offsetWidth)
    wrapper.style.zoom = String(Math.max(0.3, scale))
  }, [])
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => fit())
    ro.observe(root)
    return () => ro.disconnect()
  }, [fit])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { renderAsync } = await loadChunk(() => import('docx-preview'))
        if (cancelled || !bodyRef.current || !styleRef.current) return
        await renderAsync(source, bodyRef.current, styleRef.current, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          breakPages: true,
          useBase64URL: true,
        })
        await applyTableIndents(source, bodyRef.current).catch(() => undefined)
        if (!cancelled) {
          fit()
          setState('ready')
        }
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
  }, [source, onError, fit])

  return (
    <div className="docx-viewer" data-state={state} ref={rootRef}>
      {state === 'loading' && <p className="muted">Відображення документа…</p>}
      <div ref={styleRef} hidden />
      <div ref={bodyRef} className="docx-body" />
    </div>
  )
}
