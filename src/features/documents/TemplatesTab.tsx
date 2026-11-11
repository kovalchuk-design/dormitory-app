import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import {
  deleteTemplate,
  downloadBlob,
  loadEducatorsCanEditTemplates,
  loadPupils,
  loadTemplates,
  uploadTemplate,
  type Library,
  type PupilOption,
} from './api'
import { DocxViewer } from './DocxViewer'
import { TemplateHelp } from './TemplateHelp'
import { Modal } from './PreviewModal'
import { PreviewPane } from './PreviewPane'
import { downloadName, validateUploadFile } from './filters'
import { canEditTemplates } from './permissions'
import { buildTemplateData, checkTemplate, docxHasText, fullName, renderDocxTemplate } from './templating'
import type { TemplateRow } from './types'
import { MultiSelect, type MultiOption } from '../../components/ui/MultiSelect'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { ScrollRows } from '../../components/ui/ScrollRows'
import { buildPdf, detectPdfKind } from './pdf'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function TemplatesTab({ lib }: { lib: Library }) {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null)
  const [educatorsCanEdit, setEducatorsCanEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('') // «Використати»
  const [previewId, setPreviewId] = useState('') // «Перегляд шаблону»
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const editable = canEditTemplates(profile?.role, educatorsCanEdit)

  const refresh = useCallback(async () => {
    try {
      const [t, flag] = await Promise.all([loadTemplates(), loadEducatorsCanEditTemplates()])
      setTemplates(t)
      setEducatorsCanEdit(flag)
    } catch (e) {
      setError(errText(e))
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    Promise.all([loadTemplates(), loadEducatorsCanEditTemplates()]).then(
      ([t, flag]) => {
        if (cancelled) return
        setTemplates(t)
        setEducatorsCanEdit(flag)
      },
      (e) => !cancelled && setError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function remove(t: TemplateRow) {
    if (!window.confirm(`Видалити шаблон «${t.title}»?`)) return
    try {
      const warn = await deleteTemplate(t)
      setNotice(warn)
      if (selectedId === t.id) setSelectedId('')
      if (previewId === t.id) setPreviewId('')
      await refresh()
    } catch (e) {
      setError(errText(e))
    }
  }

  const selected = templates?.find((t) => t.id === selectedId) ?? null
  const previewing = templates?.find((t) => t.id === previewId) ?? null
  const shownTemplates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('uk')
    return (templates ?? []).filter((t) => !q || t.title.toLocaleLowerCase('uk').includes(q))
  }, [templates, query])
  const closeAdd = useCallback(() => setAdding(false), [])
  const closePreview = useCallback(() => setPreviewId(''), [])

  function pickTemplate(t: TemplateRow) {
    setSelectedId(t.id)
    setPreviewId('')
  }
  /** Клік по рядку: вибрати шаблон; повторний клік по вибраному знімає вибір. */
  const toggleUse = (t: TemplateRow) => (t.id === selectedId ? setSelectedId('') : pickTemplate(t))

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {templates === null ? (
        <p className="muted">Завантаження…</p>
      ) : (
        <div className="tpl-layout">
          <aside className="panel tpl-left" aria-label="Шаблони">
            <h2>Шаблони</h2>
            {templates.length > 5 && (
              <input type="search" className="tpl-search" placeholder="Пошук…" aria-label="Пошук шаблону" value={query} onChange={(e) => setQuery(e.target.value)} />
            )}
            {templates.length === 0 ? (
              <p className="muted">Шаблонів ще немає.{editable ? '' : ' Їх додає адміністратор.'}</p>
            ) : shownTemplates.length === 0 ? (
              <p className="muted">Нічого не знайдено.</p>
            ) : (
              <ScrollRows item=".tpl-row" inset={false}><ul className="tpl-list" role="group" aria-label="Шаблон для формування документа (можна вибрати один)">
                {shownTemplates.map((t) => (
                  <li key={t.id} className={`tpl-row${t.id === selectedId ? ' selected' : ''}`}>
                    <button type="button" role="checkbox" aria-checked={t.id === selectedId} className="tpl-pick" title={t.id === selectedId ? 'Зняти вибір' : 'Вибрати шаблон'} onClick={() => toggleUse(t)}>
                      <span className="tpl-check" aria-hidden="true" />
                      <span className="tpl-title">{t.title}</span>
                    </button>
                    <button type="button" className="tpl-icon" data-preview aria-label={`Перегляд шаблону «${t.title}»`} title="Перегляд" onClick={() => setPreviewId(t.id)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                    {editable && (
                      <button type="button" className="tpl-icon danger" aria-label={`Видалити шаблон «${t.title}»`} title="Видалити" onClick={() => void remove(t)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul></ScrollRows>
            )}
            {editable ? (
              <button type="button" className="tpl-add" onClick={() => setAdding(true)}>+ Додати</button>
            ) : (
              <p className="muted small">Шаблони додає й змінює адміністратор.</p>
            )}
          </aside>

          <div className="tpl-right">
            <div>
              {selected ? (
                <Autofill key={selected.id} template={selected} lib={lib} />
              ) : (
                <section className="panel tpl-idle" aria-disabled="true">
                  <h2>Оберіть учнів</h2>
                  <p className="muted">Спершу виберіть шаблон ліворуч і натисніть «Використати» — тут з’явиться вибір учнів.</p>
                  <button type="button" disabled>Сформувати</button>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
      {previewing && (
        <Modal
          title={`Перегляд: «${previewing.title}»`}
          onClose={closePreview}
          wide
          footer={previewing.id !== selectedId ? <button type="button" onClick={() => pickTemplate(previewing)}>Використати</button> : undefined}
        >
          <PreviewPane key={previewing.id} storagePath={previewing.storage_path} title={previewing.title} fileType="docx" downloadable={false} />
        </Modal>
      )}
      {adding && (
        <Modal title="Додати шаблон" onClose={closeAdd} narrow>
          <TemplateUpload onDone={async () => { setAdding(false); setNotice('Шаблон додано.'); await refresh() }} />
          <TemplateHelp />
        </Modal>
      )}
    </div>
  )
}

function TemplateUpload({ onDone }: { onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Оберіть файл .docx')
    const problem = validateUploadFile(file, ['docx'])
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      const check = await checkTemplate(await file.arrayBuffer())
      if (check.error) throw new Error(`Шаблон містить помилку: ${check.error}`)
      await uploadTemplate(file, title || file.name.replace(/\.[^.]+$/, ''), check.placeholders)
      setFile(null)
      setTitle('')
      await onDone()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  function pick(f: File | null) {
    setFile(f)
    setError(null)
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  return (
    <form className="tpl-upload" onSubmit={(e) => void submit(e)}>
      <label>Назва шаблону
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад: Заява на поселення" autoFocus />
      </label>
      <div className="file-field">
        <span className="file-field-label">Файл .docx з полями {'{{…}}'}</span>
        <label
          className={`file-drop${file ? ' has-file' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}
        >
          <input type="file" accept=".docx" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <span className="file-drop-icon" aria-hidden="true">{file ? '✓' : '+'}</span>
          <span className="file-drop-text">
            {file ? <strong>{file.name}</strong> : <>Натисніть, щоб обрати файл<span className="muted small"> або перетягніть сюди</span></>}
          </span>
          {file && <span className="file-drop-change">Змінити</span>}
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy || !file}>{busy ? 'Перевірка…' : 'Додати'}</button>
    </form>
  )
}

function Autofill({ template, lib }: { template: TemplateRow; lib: Library }) {
  const { profile } = useAuth()
  const [pupils, setPupils] = useState<PupilOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyChosen, setOnlyChosen] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string; data: Record<string, unknown> } | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfKind = useMemo(() => detectPdfKind(template.placeholders), [template.placeholders])
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPupils().then(
      (p) => !cancelled && setPupils(p),
      (e) => !cancelled && setLoadError(errText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const rooms = useMemo(() => [...new Set((pupils ?? []).map((p) => p.room).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, 'uk', { numeric: true })), [pupils])
  const roomInfo = useMemo(() => {
    const m = new Map<string, { floor: number | null; ids: string[] }>()
    for (const p of pupils ?? []) {
      if (!p.room) continue
      const e = m.get(p.room) ?? { floor: p.floor ?? null, ids: [] }
      e.ids.push(p.id)
      m.set(p.room, e)
    }
    return m
  }, [pupils])
  const roomOptions: MultiOption[] = useMemo(
    () =>
      rooms
        .map((r) => ({ r, ...roomInfo.get(r)! }))
        .sort((a, b) => (a.floor ?? 99) - (b.floor ?? 99) || a.r.localeCompare(b.r, 'uk', { numeric: true }))
        .map(({ r, floor, ids }) => ({ value: r, label: `${r} · ${ids.length} учн.`, group: floor != null ? `${floor} поверх` : 'Без поверху' })),
    [rooms, roomInfo],
  )
  const pickedRooms = useMemo(() => rooms.filter((r) => roomInfo.get(r)!.ids.every((id) => chosen.has(id))), [rooms, roomInfo, chosen])
  function setRooms(next: string[]) {
    const now = new Set(next)
    const was = new Set(pickedRooms)
    change((s) => {
      const n = new Set(s)
      for (const r of rooms) {
        const ids = roomInfo.get(r)!.ids
        if (now.has(r) && !was.has(r)) ids.forEach((id) => n.add(id))
        if (!now.has(r) && was.has(r)) ids.forEach((id) => n.delete(id))
      }
      return n
    })
  }
  const floors = useMemo(
    () =>
      [...new Set((pupils ?? []).map((p) => p.floor).filter((f): f is number => f != null))]
        .sort((a, b) => a - b)
        .map((f) => {
          const ids = (pupils ?? []).filter((p) => p.floor === f).map((p) => p.id)
          return { floor: f, ids, picked: ids.filter((id) => chosen.has(id)).length }
        }),
    [pupils, chosen],
  )
  const ordered = useMemo(
    () =>
      [...(pupils ?? [])].sort(
        (a, b) =>
          (a.room ?? '\uffff').localeCompare(b.room ?? '\uffff', 'uk', { numeric: true }) || fullName(a).localeCompare(fullName(b), 'uk'),
      ),
    [pupils],
  )
  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('uk')
    return ordered.filter((p) => (!onlyChosen || chosen.has(p.id)) && (!q || fullName(p).toLocaleLowerCase('uk').includes(q)))
  }, [ordered, search, onlyChosen, chosen])

  const change = (fn: (s: Set<string>) => Set<string>) => {
    setChosen(fn)
    setResult(null)
  }
  const toggle = (id: string) =>
    change((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  const toggleMany = (ids: string[]) =>
    change((s) => {
      const n = new Set(s)
      const all = ids.length > 0 && ids.every((id) => n.has(id))
      for (const id of ids) {
        if (all) n.delete(id)
        else n.add(id)
      }
      return n
    })

  async function generate() {
    if (!profile || !pupils) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const selected = pupils.filter((p) => chosen.has(p.id))
      const buf = await (await downloadBlob(template.storage_path)).arrayBuffer()
      const data = buildTemplateData({
        students: selected,
        educatorName: profile.full_name,
        yearName: lib.years.find((y) => y.is_current)?.name ?? null,
      })
      const blob = await renderDocxTemplate(buf, data)
      if (!(await docxHasText(blob))) {
        throw new Error('Документ вийшов порожнім. Найімовірніше, відкрита стара версія сторінки: оновіть її (Ctrl+Shift+R) і сформуйте знову.')
      }
      const chosenFloors = [...new Set(selected.map((p) => p.floor))]
      const suffix =
        selected.length === 1 ? fullName(selected[0]) : chosenFloors.length === 1 && chosenFloors[0] != null ? `${chosenFloors[0]} поверх, ${selected.length} учнів` : `${selected.length} учнів`
      setResult({ blob, data, name: downloadName(`${template.title} — ${suffix}`, 'x.docx') })
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  function saveFile(source: Blob, fileName: string) {
    const url = URL.createObjectURL(source)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  const saveDocx = () => result && saveFile(result.blob, result.name)
  async function savePdf() {
    if (!result || !pdfKind || pdfBusy) return
    setPdfBusy(true)
    setPdfError(null)
    try {
      const bytes = await buildPdf(pdfKind, result.data)
      saveFile(new Blob([bytes as BlobPart], { type: 'application/pdf' }), result.name.replace(/\.docx$/i, '.pdf'))
    } catch (e) {
      setPdfError(`Не вдалося створити PDF: ${errText(e)}`)
    } finally {
      setPdfBusy(false)
    }
  }
  /** «Завантажити» з вибором формату (PDF / Word); якщо в шаблону немає PDF-вигляду — лише Word. */
  const downloadControl = (
    pdfKind ? (
      <ActionMenu label={pdfBusy ? 'Готуємо PDF…' : 'Завантажити'} items={[{ label: 'PDF', onClick: () => void savePdf() }, { label: 'Word (.docx)', onClick: saveDocx }]} />
    ) : (
      <button type="button" onClick={saveDocx} title={result?.name}>Завантажити .docx</button>
    )
  )

  return (
    <section className="panel tpl-active">
      <h2>Оберіть учнів</h2>
      <p className="tpl-chosen-template">Шаблон: <strong>«{template.title}»</strong></p>
      {loadError && <p className="error">{loadError}</p>}
      {pupils === null && !loadError && <p className="muted">Завантаження учнів…</p>}
      {pupils && (
        <>
          <div className="floor-chips" role="group" aria-label="Вибрати весь поверх">
            {floors.map(({ floor, ids, picked }) => {
              const all = ids.length > 0 && picked === ids.length
              return (
                <button
                  key={floor}
                  type="button"
                  className={`chip${all ? ' on' : picked > 0 ? ' part' : ''}`}
                  aria-pressed={all}
                  title={all ? 'Зняти вибір поверху' : 'Вибрати весь поверх'}
                  onClick={() => toggleMany(ids)}
                >
                  {floor} поверх · {picked}/{ids.length}
                </button>
              )
            })}
          </div>
          <div className="filters">
            <input type="search" placeholder="Пошук учня…" aria-label="Пошук учня" value={search} onChange={(e) => setSearch(e.target.value)} />
            <MultiSelect label="Кімнати" aria-label="Вибрати кімнати" options={roomOptions} value={pickedRooms} onChange={setRooms} />
            <button type="button" className="secondary" aria-pressed={onlyChosen} onClick={() => setOnlyChosen((v) => !v)}>Вибрані</button>
            <button type="button" className="secondary" onClick={() => change(() => new Set())} disabled={chosen.size === 0}>Очистити</button>
          </div>
          {pupils.length === 0 && <p className="muted">Немає учнів, дані яких вам доступні.</p>}
          {pupils.length > 0 && shown.length === 0 && <p className="muted">Нікого не знайдено.</p>}
          <div className="pupil-box"><ScrollRows item="li" inset={false}><ul className="pupil-list">
            {shown.map((p) => (
              <li key={p.id} className={chosen.has(p.id) ? 'on' : undefined}>
                <label>
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="pupil-name">{fullName(p)}</span>
                  <span className="muted small pupil-meta">{p.room ? `кімн. ${p.room}` : 'без кімнати'}</span>
                </label>
              </li>
            ))}
          </ul></ScrollRows></div>
          <p className="tpl-count" aria-live="polite">Вибрано: <strong>{chosen.size}</strong> із {pupils.length}</p>
          {error && <p className="error">{error}</p>}
          <button type="button" disabled={busy || chosen.size === 0} onClick={() => void generate()}>
            {busy ? 'Формування…' : 'Сформувати'}
          </button>
        </>
      )}
      {result && (
        <div className="tpl-result" aria-label="Готовий документ">
          <div className="tpl-result-head">
            <h3>Готовий документ</h3>
            <div className="card-actions">
              <button type="button" className="secondary" onClick={() => setZoomed(true)}>Відкрити на весь екран</button>
              {downloadControl}
            </div>
          </div>
          {pdfError && <p className="error">{pdfError}</p>}
          <DocxViewer source={result.blob} />
        </div>
      )}
      {zoomed && result && (
        <Modal
          title={result.name.replace(/\.docx$/, '')}
          onClose={() => setZoomed(false)}
          wide
          footer={
            <>
              {downloadControl}
              <button type="button" className="secondary" onClick={() => setZoomed(false)}>Закрити</button>
            </>
          }
        >
          <DocxViewer source={result.blob} />
        </Modal>
      )}
    </section>
  )
}
