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

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function TemplatesTab({ lib }: { lib: Library }) {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null)
  const [educatorsCanEdit, setEducatorsCanEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [previewing, setPreviewing] = useState<TemplateRow | null>(null)
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
      await refresh()
    } catch (e) {
      setError(errText(e))
    }
  }

  const selected = templates?.find((t) => t.id === selectedId) ?? null

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {templates === null ? (
        <p className="muted">Завантаження…</p>
      ) : (
        <>
          <h2>1. Оберіть шаблон</h2>
          {templates.length === 0 ? (
            <p className="muted">Шаблонів ще немає.{editable ? '' : ' Їх додає адміністратор.'}</p>
          ) : (
            <ul className="doc-list">
              {templates.map((t) => (
                <li key={t.id} className={`doc-card${t.id === selectedId ? ' selected' : ''}`}>
                  <h3>{t.title}</h3>
                  {editable && <p className="small muted">Поля: {t.placeholders.length ? t.placeholders.join(', ') : '—'}</p>}
                  <div className="card-actions">
                    <button type="button" onClick={() => setSelectedId(t.id)}>Використати</button>
                    <button type="button" className="secondary" onClick={() => setPreviewing(t)}>Перегляд шаблону</button>
                    {editable && <button type="button" className="danger" onClick={() => void remove(t)}>Видалити</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {editable ? (
            <>
              <TemplateHelp />
              <TemplateUpload onDone={async () => { setNotice('Шаблон додано.'); await refresh() }} />
            </>
          ) : (
            <p className="muted small">Шаблони додає й змінює адміністратор.</p>
          )}
          {selected && <Autofill key={selected.id} template={selected} lib={lib} />}
        </>
      )}
      {previewing && (
        <Modal title={previewing.title} onClose={() => setPreviewing(null)}>
          <PreviewPane storagePath={previewing.storage_path} title={previewing.title} fileType="docx" />
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
    <form className="panel" onSubmit={(e) => void submit(e)}>
      <h3>Додати шаблон</h3>
      <label>Файл .docx з полями {'{{…}}'}
        <input type="file" accept=".docx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }} />
      </label>
      <label>Назва
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
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)

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
  const floors = useMemo(() => [...new Set((pupils ?? []).map((p) => p.floor).filter((f): f is number => f != null))].sort(), [pupils])
  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('uk')
    return (pupils ?? []).filter((p) => !q || fullName(p).toLocaleLowerCase('uk').includes(q))
  }, [pupils, search])

  const toggle = (id: string) =>
    setChosen((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  const addWhere = (pred: (p: PupilOption) => boolean) =>
    setChosen((s) => new Set([...s, ...(pupils ?? []).filter(pred).map((p) => p.id)]))

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
      const suffix = selected.length === 1 ? fullName(selected[0]) : `${selected.length} учнів`
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
    <section className="panel">
      <h2>2. Оберіть учнів — «{template.title}»</h2>
      {loadError && <p className="error">{loadError}</p>}
      {pupils === null && !loadError && <p className="muted">Завантаження учнів…</p>}
      {pupils && (
        <>
          <div className="filters">
            <input type="search" placeholder="Пошук учня…" aria-label="Пошук учня" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Додати кімнату" value="" onChange={(e) => e.target.value && addWhere((p) => p.room === e.target.value)}>
              <option value="">Додати всю кімнату…</option>
              {rooms.map((r) => <option key={r} value={r}>Кімната {r}</option>)}
            </select>
            <select aria-label="Додати поверх" value="" onChange={(e) => e.target.value && addWhere((p) => String(p.floor) === e.target.value)}>
              <option value="">Додати весь поверх…</option>
              {floors.map((f) => <option key={f} value={f}>{f} поверх</option>)}
            </select>
            <button type="button" className="secondary" onClick={() => setChosen(new Set())} disabled={chosen.size === 0}>Очистити вибір</button>
          </div>
          {pupils.length === 0 && <p className="muted">Немає учнів, дані яких вам доступні.</p>}
          <ul className="pupil-list">
            {shown.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                  {fullName(p)} <span className="muted small">{p.grade ? `· ${p.grade} кл.` : ''}{p.room ? ` · кімн. ${p.room}` : ''}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="small">Вибрано: {chosen.size}</p>
          {error && <p className="error">{error}</p>}
          <button type="button" disabled={busy || chosen.size === 0} onClick={() => void generate()}>
            {busy ? 'Формування…' : '3. Сформувати документ'}
          </button>
        </>
      )}
      {result && (
        <div>
          <div className="card-actions"><button type="button" onClick={save}>Завантажити {result.name}</button></div>
          <DocxViewer source={result.blob} />
        </div>
      )}
    </section>
  )
}
