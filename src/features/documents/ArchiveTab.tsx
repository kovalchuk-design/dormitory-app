import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { deleteDocument, downloadFile, uploadDocument } from './api'
import { CreateFromModal } from './CreateFromModal'
import { DocBadges } from './DocBadges'
import { makeLookups } from './lookups'
import { Modal } from './PreviewModal'
import { PreviewPane } from './PreviewPane'
import {
  collectOptions,
  EMPTY_FILTERS,
  fileTypeOf,
  filterDocuments,
  hasActiveFilters,
  parseTags,
  SORT_LABELS,
  sortDocuments,
  validateUploadFile,
  type DocumentFilters,
  type SortKey,
} from './filters'
import { canDeleteDocument, canUpload } from './permissions'
import type { DocumentRow } from './types'
import type { Library } from './api'
import { Select } from '../../components/ui/Select'

interface Props {
  lib: Library
  reload: () => Promise<void>
}

export function ArchiveTab({ lib, reload }: Props) {
  const { profile } = useAuth()
  const [filters, setFilters] = useState<DocumentFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortKey>('created_desc')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [creatingFrom, setCreatingFrom] = useState<DocumentRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lookups = useMemo(() => makeLookups(lib.years, lib.authors), [lib.years, lib.authors])
  const options = useMemo(() => collectOptions(lib.documents), [lib.documents])
  const byId = useMemo(() => new Map(lib.documents.map((d) => [d.id, d])), [lib.documents])
  const visible = useMemo(
    () => sortDocuments(filterDocuments(lib.documents, filters), sort, lib.years),
    [lib.documents, lib.years, filters, sort],
  )
  const set = (patch: Partial<DocumentFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const previewDoc = previewId ? byId.get(previewId) : undefined
  const uploader = canUpload(profile?.role)

  async function remove(doc: DocumentRow) {
    if (!window.confirm(`Видалити документ «${doc.title}»? Дію не можна скасувати.`)) return
    setError(null)
    setMessage(null)
    try {
      const warn = await deleteDocument(doc)
      if (warn) setMessage(warn)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function download(doc: DocumentRow) {
    setError(null)
    try {
      await downloadFile(doc.storage_path, doc.title)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Пошук за назвою…"
          aria-label="Пошук за назвою"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
        <Select aria-label="Сортування" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {Object.entries(SORT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        {uploader && (
          <button type="button" onClick={() => setShowUpload((s) => !s)}>
            {showUpload ? 'Сховати форму' : '＋ Завантажити документ'}
          </button>
        )}
      </div>

      <div className="filters">
        <Select aria-label="Категорія" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Усі категорії</option>
          {options.categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select aria-label="Тема" value={filters.topic} onChange={(e) => set({ topic: e.target.value })}>
          <option value="">Усі теми</option>
          {options.topics.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select aria-label="Навчальний рік" value={filters.yearId} onChange={(e) => set({ yearId: e.target.value })}>
          <option value="">Усі роки</option>
          {lib.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </Select>
        <Select aria-label="Автор" value={filters.authorId} onChange={(e) => set({ authorId: e.target.value })}>
          <option value="">Усі автори</option>
          {lib.authors.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </Select>
        <Select aria-label="Тип файлу" value={filters.fileType} onChange={(e) => set({ fileType: e.target.value as DocumentFilters['fileType'] })}>
          <option value="">Усі типи</option>
          <option value="docx">Word (.docx)</option>
          <option value="pdf">PDF</option>
        </Select>
        {hasActiveFilters(filters) && (
          <button type="button" className="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Скинути</button>
        )}
      </div>
      {options.tags.length > 0 && (
        <div className="tag-filter" aria-label="Теги">
          {options.tags.map((t) => {
            const on = filters.tags.includes(t)
            return (
              <button
                key={t}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => set({ tags: on ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] })}
              >
                #{t}
              </button>
            )
          })}
        </div>
      )}

      {showUpload && uploader && profile && (
        <UploadForm
          lib={lib}
          options={options}
          authorId={profile.id}
          onDone={async (m) => {
            setMessage(m)
            setShowUpload(false)
            await reload()
          }}
        />
      )}

      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}

      <p className="muted small">Знайдено: {visible.length} з {lib.documents.length}</p>
      {visible.length === 0 ? (
        <p className="muted">{lib.documents.length === 0 ? 'Архів порожній.' : 'Нічого не знайдено за цими умовами.'}</p>
      ) : (
        <ul className="doc-list">
          {visible.map((doc) => {
            const parent = doc.based_on_document_id ? byId.get(doc.based_on_document_id) : undefined
            return (
              <li key={doc.id} className="doc-card">
                <h3>{doc.title}</h3>
                <DocBadges doc={doc} lookups={lookups} />
                {parent && (
                  <p className="lineage small">
                    Створено на основі:{' '}
                    <button type="button" className="link" onClick={() => setPreviewId(parent.id)}>
                      {parent.title}
                    </button>
                    {parent.academic_year_id && ` (${lookups.years.get(parent.academic_year_id)?.name ?? ''}`}
                    {parent.author_id && `${parent.academic_year_id ? ', ' : ' ('}${lookups.authors.get(parent.author_id)?.full_name ?? ''}`}
                    {(parent.academic_year_id || parent.author_id) && ')'}
                  </p>
                )}
                <div className="card-actions">
                  <button type="button" onClick={() => setPreviewId(doc.id)} disabled={fileTypeOf(doc) === 'other'}>Перегляд</button>
                  <button type="button" className="secondary" onClick={() => void download(doc)}>Завантажити</button>
                  {uploader && (
                    <button type="button" className="secondary" onClick={() => setCreatingFrom(doc)}>Створити на основі цього</button>
                  )}
                  {canDeleteDocument(profile, doc) && (
                    <button type="button" className="danger" onClick={() => void remove(doc)}>Видалити</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {previewDoc && (
        <Modal
          title={previewDoc.title}
          onClose={() => setPreviewId(null)}
          footer={
            uploader ? (
              <button
                type="button"
                onClick={() => {
                  setPreviewId(null)
                  setCreatingFrom(previewDoc)
                }}
              >
                Створити на основі цього
              </button>
            ) : undefined
          }
        >
          <PreviewPane key={previewDoc.id} storagePath={previewDoc.storage_path} title={previewDoc.title} fileType={fileTypeOf(previewDoc)} />
        </Modal>
      )}
      {creatingFrom && <CreateFromModal source={creatingFrom} lib={lib} reload={reload} onClose={() => setCreatingFrom(null)} />}
    </div>
  )
}

function UploadForm({
  lib,
  options,
  authorId,
  onDone,
}: {
  lib: Library
  options: ReturnType<typeof collectOptions>
  authorId: string
  onDone: (message: string) => Promise<void>
}) {
  const current = lib.years.find((y) => y.is_current)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [topic, setTopic] = useState('')
  const [yearId, setYearId] = useState(current?.id ?? '')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(f: File | null) {
    setFile(f)
    setError(null)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Оберіть файл')
    const problem = validateUploadFile(file)
    if (problem) return setError(problem)
    if (!title.trim()) return setError('Вкажіть назву')
    setBusy(true)
    setError(null)
    try {
      await uploadDocument(file, fileTypeOf({ mime_type: file.type, storage_path: file.name }), {
        title, category, topic, academicYearId: yearId || null, tags: parseTags(tags),
      }, authorId)
      await onDone(`Документ «${title.trim()}» завантажено.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="panel upload-form" onSubmit={(e) => void submit(e)}>
      <h2>Новий документ</h2>
      <label>Файл (.docx або .pdf, до 25 МБ)
        <input type="file" accept=".docx,.pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      <label>Назва
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <div className="grid-2">
        <label>Категорія
          <input list="dl-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label>Тема
          <input list="dl-topics" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label>Навчальний рік
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            <option value="">—</option>
            {lib.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </label>
        <label>Теги (через кому)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <datalist id="dl-categories">{options.categories.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-topics">{options.topics.map((c) => <option key={c} value={c} />)}</datalist>
      <p className="muted small">Автор — поточний користувач. Не завантажуйте медичні документи учнів.</p>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Завантаження…' : 'Завантажити'}</button>
    </form>
  )
}
