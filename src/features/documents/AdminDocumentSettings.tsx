import { useEffect, useState } from 'react'
import { loadEducatorsCanEditTemplates, saveEducatorsCanEditTemplates } from './api'

/** Перемикач для розділу «Адміністрування» (сторінка доступна лише admin; запис додатково захищений RLS). */
export function AdminDocumentSettings() {
  const [value, setValue] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadEducatorsCanEditTemplates().then(
      (v) => !cancelled && setValue(v),
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function change(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      await saveEducatorsCanEditTemplates(next)
      setValue(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="doc-settings-h">
      <h2 id="doc-settings-h">Документи</h2>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          checked={value === true}
          disabled={value === null || busy}
          onChange={(e) => void change(e.target.checked)}
        />
        Вихователі можуть редагувати шаблони документів
      </label>
      <p className="muted small">Адміністратор редагує шаблони завжди. Перемикач зберігається в налаштуванні <code>educators_can_edit_templates</code>.</p>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
