import { useMemo, useState, type Dispatch } from 'react'
import { useAuth } from '../../auth/useAuth'
import { createBasedOn, downloadFile } from './api'
import { candidatesForTopic, canCreate, defaultBasedOnTitle, type BasedOnAction, type BasedOnState } from './basedOn'
import { DocBadges } from './DocBadges'
import { makeLookups } from './lookups'
import { collectOptions, fileTypeOf } from './filters'
import { canUpload } from './permissions'
import { PreviewPane } from './PreviewPane'
import type { DocumentRow } from './types'
import type { Library } from './api'

interface Props {
  lib: Library
  reload: () => Promise<void>
  state: BasedOnState
  dispatch: Dispatch<BasedOnAction>
}

export function BasedOnTab({ lib, reload, state, dispatch }: Props) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lookups = useMemo(() => makeLookups(lib.years, lib.authors), [lib.years, lib.authors])
  const options = useMemo(() => collectOptions(lib.documents), [lib.documents])
  const current = lib.years.find((y) => y.is_current) ?? null
  const source = state.sourceId ? lib.documents.find((d) => d.id === state.sourceId) : undefined
  const candidates = useMemo(
    () => candidatesForTopic(lib.documents, { category: state.category, topic: state.topic }, lib.years),
    [lib.documents, lib.years, state.category, state.topic],
  )

  if (!canUpload(profile?.role) || !profile) {
    return <p className="muted">Створювати документи можуть лише вихователі та адміністратор.</p>
  }

  async function create() {
    if (!source || !profile) return
    setBusy(true)
    setError(null)
    try {
      const created = await createBasedOn(source, { title: state.title, academicYearId: current?.id ?? null, authorId: profile.id })
      await reload()
      dispatch({ type: 'created', documentId: created.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ---- крок 4: готово
  if (state.step === 'done') {
    const created = lib.documents.find((d) => d.id === state.createdId)
    return (
      <div className="panel">
        <h2>Документ створено</h2>
        <p>«{created?.title ?? state.title}» — копія документа «{source?.title}» з вашим авторством{current ? ` і роком ${current.name}` : ''}.</p>
        <div className="card-actions">
          {created && <button type="button" onClick={() => void downloadFile(created.storage_path, created.title)}>Завантажити для редагування</button>}
          <button type="button" className="secondary" onClick={() => dispatch({ type: 'reset' })}>Створити ще один</button>
        </div>
        <p className="muted small">Відредагуйте файл у Word і за потреби завантажте оновлену версію як новий документ в «Архіві».</p>
      </div>
    )
  }

  // ---- кроки 2–3: перегляд і підтвердження
  if ((state.step === 'preview' || state.step === 'confirm') && source) {
    return (
      <div>
        <button type="button" className="secondary" onClick={() => dispatch({ type: 'backToList' })}>← До списку</button>
        <h2>{source.title}</h2>
        <DocBadges doc={source} lookups={lookups} />
        {state.step === 'preview' ? (
          <div className="card-actions sticky-actions">
            <button type="button" onClick={() => dispatch({ type: 'accept', title: defaultBasedOnTitle(source.title, current?.name ?? null) })}>
              Створити на основі цього
            </button>
          </div>
        ) : (
          <div className="panel">
            <label>Назва нового документа
              <input value={state.title} onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })} autoFocus />
            </label>
            <p className="muted small">
              Автор: {profile.full_name}. Навчальний рік: {current?.name ?? 'не визначено'}. Файл буде скопійовано; оригінал не змінюється.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="card-actions">
              <button type="button" disabled={busy || !canCreate(state)} onClick={() => void create()}>
                {busy ? 'Створення…' : 'Створити копію'}
              </button>
              <button type="button" className="secondary" onClick={() => dispatch({ type: 'openPreview', sourceId: source.id })}>Назад до перегляду</button>
            </div>
          </div>
        )}
        <PreviewPane key={source.id} storagePath={source.storage_path} title={source.title} fileType={fileTypeOf(source)} />
      </div>
    )
  }

  // ---- крок 1: вибір теми та попереднього документа
  return (
    <div>
      <p>Оберіть категорію або тему — і побачите попередні документи за минулі роки та від інших авторів. Відкрийте перегляд, щоб оцінити якість, і лише потім створюйте копію.</p>
      <div className="filters">
        <select aria-label="Категорія" value={state.category} onChange={(e) => dispatch({ type: 'setTopic', category: e.target.value, topic: '' })}>
          <option value="">Категорія…</option>
          {options.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Тема" value={state.topic} onChange={(e) => dispatch({ type: 'setTopic', category: state.category, topic: e.target.value })}>
          <option value="">Тема…</option>
          {options.topics.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {!state.category && !state.topic ? (
        <p className="muted">Оберіть категорію чи тему.</p>
      ) : candidates.length === 0 ? (
        <p className="muted">Попередніх документів за цією темою немає.</p>
      ) : (
        <ul className="doc-list">
          {candidates.map((d: DocumentRow) => (
            <li key={d.id} className="doc-card">
              <h3>{d.title}</h3>
              <DocBadges doc={d} lookups={lookups} />
              <div className="card-actions">
                <button type="button" onClick={() => dispatch({ type: 'openPreview', sourceId: d.id })} disabled={fileTypeOf(d) === 'other'}>
                  Переглянути
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
