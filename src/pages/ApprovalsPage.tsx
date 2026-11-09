import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  changedCount, diffRecords, MEDICAL_FIELDS, PROFILE_FIELDS, withStudentIdentity, type FieldDiff,
} from '../lib/diff'
import { errorMessage, fullName, formatDateTime } from '../lib/format'
import { notifyPendingChanged } from '../lib/pending'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

async function loadPending() {
  const pend = await supabase
    .from('student_profiles')
    .select('*, students(id,last_name,first_name,patronymic,grade,birth_date)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
  if (pend.error) throw pend.error
  const studentIds = [...new Set(pend.data.map((p) => p.student_id))]
  if (studentIds.length === 0) return []
  const [cur, med, sub] = await Promise.all([
    supabase.from('student_profiles').select('*').in('student_id', studentIds).eq('status', 'approved'),
    supabase.from('student_medical').select('*').in('student_id', studentIds),
    supabase.from('student_medical_submissions').select('*').in('profile_id', pend.data.map((p) => p.id)),
  ])
  if (cur.error) throw cur.error
  if (med.error) throw med.error
  if (sub.error) throw sub.error
  return pend.data.map((p) => {
    const student = p.students as unknown as { id: string; last_name: string; first_name: string; patronymic: string | null; grade: number; birth_date: string | null }
    const approved = cur.data.find((c) => c.student_id === p.student_id) ?? null
    const submission = sub.data.find((s) => s.profile_id === p.id) ?? null
    const medical = med.data.find((m) => m.student_id === p.student_id) ?? null
    const profileDiff = diffRecords(withStudentIdentity(approved, student), withStudentIdentity(p, student), PROFILE_FIELDS)
    // порожнє поле медичних даних у поданні = «без змін»
    const medDiff = submission
      ? diffRecords(medical, {
          allergies: submission.allergies ?? medical?.allergies,
          chronic_conditions: submission.chronic_conditions ?? medical?.chronic_conditions,
        }, MEDICAL_FIELDS)
      : []
    return { id: p.id, version_no: p.version_no, submitted_at: p.submitted_at, student, hasCurrent: approved != null, profileDiff, medDiff }
  })
}

function DiffTable({ rows, title, onlyChanged }: { rows: FieldDiff[]; title: string; onlyChanged: boolean }) {
  const shown = onlyChanged ? rows.filter((r) => r.changed) : rows
  return (
    <div className="table-wrap">
      <table className="data diff">
        <caption className="sr-only">{title}</caption>
        <thead><tr><th scope="col">Поле</th><th scope="col">Чинна версія</th><th scope="col">Нова версія</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} className={r.changed ? 'changed' : undefined}>
              <th scope="row">{r.label}{r.changed && <span className="sr-only"> (змінено)</span>}</th>
              <td data-label="Чинна">{r.before || <span className="muted">—</span>}</td>
              <td data-label="Нова">{r.after || <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ApprovalsPage() {
  const { data, error, loading, reload } = useLoad(loadPending, 'pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [onlyChanged, setOnlyChanged] = useState(true)

  async function act(id: string, kind: 'approve' | 'reject') {
    if (kind === 'reject' && !window.confirm('Відхилити цю версію? Чинна анкета залишиться без змін.')) return
    setBusyId(id); setActionError(null)
    const { error: err } = kind === 'approve'
      ? await supabase.rpc('approve_student_profile', { p_profile_id: id })
      : await supabase.rpc('reject_student_profile', { p_profile_id: id })
    setBusyId(null)
    if (err) setActionError(errorMessage(err))
    reload()
    notifyPendingChanged()
  }

  return (
    <section>
      <div className="page-head">
        <h1>Оновлення даних</h1>
        <label className="check"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Лише змінені поля</label>
      </div>
      {loading && <p className="muted">Завантаження…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {data && data.length === 0 && <p className="muted">Немає версій, що чекають підтвердження.</p>}
      {data?.map((item) => {
        const n = changedCount(item.profileDiff) + changedCount(item.medDiff)
        return (
          <article key={item.id} className="panel" aria-labelledby={`h-${item.id}`}>
            <h2 id={`h-${item.id}`}><Link to={`/students/${item.student.id}`}>{fullName(item.student)}</Link>, {item.student.grade} клас</h2>
            <p className="muted small">
              Версія {item.version_no} · подано {formatDateTime(item.submitted_at)} · змінених полів: {n}
              {!item.hasCurrent && ' · чинної версії ще немає (перша анкета)'}
            </p>
            <DiffTable rows={item.profileDiff} title="Порівняння анкети" onlyChanged={onlyChanged && item.hasCurrent} />
            {item.medDiff.length > 0 && (
              <>
                <h3>Медична інформація (з поданої анкети)</h3>
                <DiffTable rows={item.medDiff} title="Порівняння медичних даних" onlyChanged={false} />
              </>
            )}
            <div className="row">
              <button type="button" disabled={busyId === item.id} onClick={() => void act(item.id, 'approve')}>Підтвердити</button>
              <button type="button" className="danger" disabled={busyId === item.id} onClick={() => void act(item.id, 'reject')}>Відхилити</button>
            </div>
          </article>
        )
      })}
    </section>
  )
}
