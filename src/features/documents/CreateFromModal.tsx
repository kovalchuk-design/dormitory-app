import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { createBasedOn, downloadFile, type Library } from './api'
import { canCreate, defaultBasedOnTitle } from './basedOn'
import { Modal } from './PreviewModal'
import type { DocumentRow } from './types'

/** «Створити на основі цього»: копія документа з архіву як новий документ (авторство й рік — поточні). */
export function CreateFromModal({ source, lib, reload, onClose }: { source: DocumentRow; lib: Library; reload: () => Promise<void>; onClose: () => void }) {
  const { profile } = useAuth()
  const current = lib.years.find((y) => y.is_current) ?? null
  const [title, setTitle] = useState(() => defaultBasedOnTitle(source.title, current?.name ?? null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<DocumentRow | null>(null)

  async function create() {
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      const doc = await createBasedOn(source, { title, academicYearId: current?.id ?? null, authorId: profile.id })
      await reload()
      setCreated(doc)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={created ? 'Документ створено' : 'Створити на основі документа'}
      onClose={onClose}
      footer={
        created ? (
          <>
            <button type="button" onClick={() => void downloadFile(created.storage_path, created.title)}>Завантажити для редагування</button>
            <button type="button" className="secondary" onClick={onClose}>Закрити</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || !canCreate({ step: 'confirm', title, sourceId: source.id, category: '', topic: '', createdId: null })} onClick={() => void create()}>
              {busy ? 'Створення…' : 'Створити копію'}
            </button>
            <button type="button" className="secondary" onClick={onClose}>Скасувати</button>
          </>
        )
      }
    >
      {created ? (
        <>
          <p>«{created.title}» — копія документа «{source.title}» з вашим авторством{current ? ` і роком ${current.name}` : ''}. Вона вже в архіві.</p>
          <p className="muted small">Відредагуйте файл у Word і за потреби завантажте оновлену версію як новий документ в «Архіві».</p>
        </>
      ) : (
        <>
          <p className="muted">Основа: «{source.title}»</p>
          <label>Назва нового документа
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <p className="muted small">Автор: {profile?.full_name}. Навчальний рік: {current?.name ?? 'не визначено'}. Файл копіюється, оригінал не змінюється.</p>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </Modal>
  )
}
