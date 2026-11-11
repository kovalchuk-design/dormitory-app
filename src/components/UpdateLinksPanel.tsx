import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDateTime } from '../lib/format'
import { buildFormLink, isLinkActive } from '../lib/links'
import { useLoad } from '../lib/useLoad'
import { Select } from './ui/Select'

const TTL_OPTIONS = [3, 7, 14, 30]

/** «Оновити дані»: створення одноразового посилання, копіювання, список активних посилань і відкликання. */
export function UpdateLinksPanel({ studentId, canCreate }: { studentId: string; canCreate: boolean }) {
  const requests = useLoad(async () => {
    const { data, error } = await supabase
      .from('update_requests') // стовпці перелічено явно: token_hash недоступний
      .select('id,kind,expires_at,used_at,created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return data
  }, studentId)
  const [ttl, setTtl] = useState(14)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ link: string; expires: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true); setError(null); setCopied(false)
    const { data, error: err } = await supabase.rpc('create_update_request', {
      p_student_id: studentId, p_kind: 'update', p_ttl_days: ttl,
    })
    setBusy(false)
    if (err || !data) return setError(errorMessage(err))
    setCreated({ link: buildFormLink(data), expires: new Date(Date.now() + ttl * 86_400_000).toISOString() })
    requests.reload()
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError('Не вдалося скопіювати — виділіть посилання вручну.')
    }
  }

  async function share(link: string) {
    try {
      await navigator.share({ title: 'Анкета гуртожитку', text: 'Заповни, будь ласка, анкету:', url: link })
    } catch {
      /* користувач закрив вікно «Поділитися» */
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Скасувати це посилання? Учень більше не зможе ним скористатися.')) return
    const { error: err } = await supabase.rpc('revoke_update_request', { p_request_id: id })
    if (err) setError(errorMessage(err))
    else {
      setCreated(null)
      requests.reload()
    }
  }

  const active = (requests.data ?? []).filter((r) => isLinkActive(r))

  return (
    <section className="panel" aria-labelledby="links-h">
      <h2 id="links-h">Оновлення даних</h2>
      {canCreate && (
        <div className="row">
          <label className="inline">
            Дійсне
            <Select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
              {TTL_OPTIONS.map((d) => <option key={d} value={d}>{d} дн.</option>)}
            </Select>
          </label>
          <button type="button" onClick={() => void create()} disabled={busy}>
            {busy ? 'Створюємо…' : 'Оновити дані'}
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {created && (
        <div className="notice" role="status">
          <p><strong>Передайте це посилання учневу</strong> (одноразове; після закриття сторінки його не можна побачити знову).</p>
          <input readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} aria-label="Посилання на анкету" />
          <p className="muted small">Діє до {formatDateTime(created.expires)}</p>
          <div className="row actions">
            <button type="button" className="secondary" onClick={() => void copy(created.link)}>
              {copied ? 'Скопійовано ✓' : 'Копіювати'}
            </button>
            {typeof navigator.share === 'function' && (
              <button type="button" onClick={() => void share(created.link)}>Поділитися (Viber, Telegram…)</button>
            )}
          </div>
        </div>
      )}
      <h3>Активні посилання</h3>
      {requests.loading ? <p className="muted">Завантаження…</p> : active.length === 0 ? (
        <p className="muted">Немає активних посилань.</p>
      ) : (
        <ul className="plain">
          {active.map((r) => (
            <li key={r.id} className="row">
              <span>створено {formatDateTime(r.created_at)}, діє до {formatDateTime(r.expires_at)}</span>
              {canCreate && <button type="button" className="secondary" onClick={() => void revoke(r.id)}>Скасувати</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
