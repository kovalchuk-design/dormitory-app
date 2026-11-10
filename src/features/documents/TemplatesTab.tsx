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
import { buildTemplateData, checkTemplate, fullName, renderDocxTemplate } from './templating'
import type { TemplateRow } from './types'
import { MultiSelect, type MultiOption } from '../../components/ui/MultiSelect'

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
  const closeAdd = useCallback(() => setAdding(false), [])
  const closePreview = useCallback(() => setPreviewId(''), [])

  function use(t: TemplateRow) {
    setSelectedId(t.id)
    setPreviewId('')
  }

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
            {templates.length === 0 ? (
              <p className="muted">Шаблонів ще немає.{editable ? '' : ' Їх додає адміністратор.'}</p>
            ) : (
              <ul className="tpl-list">
                {templates.map((t) => (
                  <li key={t.id} className={`tpl-item${t.id === selectedId ? ' selected' : ''}${t.id === previewId ? ' previewing' : ''}`}>
                    <h3>
                      {t.title}
                      {t.id === selectedId && <span className="tpl-state">Вибрано</span>}
                    </h3>
                    {editable && <p className="small muted" title={t.placeholders.join(', ')}>Полів для автозаповнення: {t.placeholders.length}</p>}
                    <div className="card-actions">
                      <button type="button" onClick={() => use(t)} aria-pressed={t.id === selectedId}>
                        {t.id === selectedId ? 'Використовується' : 'Використати'}
                      </button>
                      <button type="button" className="secondary" onClick={() => setPreviewId(t.id)}>
                        Перегляд шаблону
                      </button>
                      {editable && <button type="button" className="danger" onClick={() => void remove(t)}>Видалити</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {editable ? (
              <button type="button" className="tpl-add" onClick={() => setAdding(true)}>+ Додати шаблон</button>
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
                  <button type="button" disabled>Сформувати документ</button>
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
          footer={
            <>
              {previewing.id !== selectedId && <button type="button" onClick={() => use(previewing)}>Використати</button>}
              <button type="button" className="secondary" onClick={closePreview}>Закрити</button>
            </>
          }
        >
          <PreviewPane key={previewing.id} storagePath={previewing.storage_path} title={previewing.title} fileType="docx" />
        </Modal>
      )}
      {adding && (
        <Modal title="Додати шаблон" onClose={closeAdd}>
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

  return (
    <form className="tpl-upload" onSubmit={(e) => void submit(e)}>
      <label>Файл .docx з полями {'{{…}}'}
        <input type="file" accept=".docx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }} />
      </label>
      <label>Назва шаблону
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад: Заява на поселення" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Перевірка…' : 'Додати шаблон'}</button>
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
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
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
        .map(({ r, floor, ids }) => ({ value: r, label: `Кімната ${r} · ${ids.length} учн.`, group: floor != null ? `${floor} поверх` : 'Без поверху' })),
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
      const chosenFloors = [...new Set(selected.map((p) => p.floor))]
      const suffix =
        selected.length === 1 ? fullName(selected[0]) : chosenFloors.length === 1 && chosenFloors[0] != null ? `${chosenFloors[0]} поверх, ${selected.length} учнів` : `${selected.length} учнів`
      setResult({ blob, name: downloadName(`${template.title} — ${suffix}`, 'x.docx') })
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

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
            <button type="button" className="secondary" aria-pressed={onlyChosen} onClick={() => setOnlyChosen((v) => !v)}>Лише вибрані</button>
            <button type="button" className="secondary" onClick={() => change(() => new Set())} disabled={chosen.size === 0}>Очистити вибір</button>
          </div>
          {pupils.length === 0 && <p className="muted">Немає учнів, дані яких вам доступні.</p>}
          {pupils.length > 0 && shown.length === 0 && <p className="muted">Нікого не знайдено.</p>}
          <ul className="pupil-list">
            {shown.map((p) => (
              <li key={p.id} className={chosen.has(p.id) ? 'on' : undefined}>
                <label>
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="pupil-name">{fullName(p)}</span>
                  <span className="muted small pupil-meta">{p.room ? `кімн. ${p.room}` : 'без кімнати'}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="tpl-count" aria-live="polite">Вибрано: <strong>{chosen.size}</strong> із {pupils.length}</p>
          {error && <p className="error">{error}</p>}
          <button type="button" disabled={busy || chosen.size === 0} onClick={() => void generate()}>
            {busy ? 'Формування…' : 'Сформувати документ'}
          </button>
        </>
      )}
      {result && (
        <div className="tpl-result" aria-label="Готовий документ">
          <h3>Готовий документ</h3>
          <DocxViewer source={result.blob} />
          <div className="tpl-result-actions">
            <button type="button" className="secondary" onClick={() => setZoomed(true)}>Відкрити на весь екран</button>
            <button type="button" onClick={save} title={result.name}>Завантажити документ (.docx)</button>
          </div>
        </div>
      )}
      {zoomed && result && (
        <Modal
          title={result.name.replace(/\.docx$/, '')}
          onClose={() => setZoomed(false)}
          wide
          footer={
            <>
              <button type="button" onClick={save}>Завантажити документ (.docx)</button>
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
