import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  changedCount, diffRecords, MEDICAL_FIELDS, PROFILE_FIELDS, withStudentIdentity, type FieldDiff,
} from '../lib/diff'
import { ScrollArea } from '../components/ui/ScrollArea'
import { MergeTable } from '../components/MergeTable'
import { errorMessage, fullName, formatDateTime } from '../lib/format'
import { buildPlan, defaultChoice, mergeSocialData, toggleChoice, MERGEABLE, type Choice, type SocialData } from '../lib/mergeChoice'
import { notifyPendingChanged } from '../lib/pending'
import { supabase } from '../lib/supabase'
import type { Json } from '../lib/database.types'
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
    // попередня ще не оброблена версія цього ж учня (повторне подання) — показуємо, що змінилось між ними
    const prevP = pend.data.filter((x) => x.student_id === p.student_id && x.version_no < p.version_no).sort((a, b) => b.version_no - a.version_no)[0]
    let prev: { version_no: number; submitted_at: string; diff: FieldDiff[]; medDiff: FieldDiff[] } | null = null
    if (prevP) {
      const prevSub = sub.data.find((x) => x.profile_id === prevP.id) ?? null
      const medKey = (r: typeof submission) => ({ allergies: r?.allergies, chronic_conditions: r?.chronic_conditions })
      prev = {
        version_no: prevP.version_no,
        submitted_at: prevP.submitted_at,
        diff: diffRecords(prevP, p, PROFILE_FIELDS),
        medDiff: prevSub || submission ? diffRecords(medKey(prevSub), medKey(submission), MEDICAL_FIELDS) : [],
      }
    }
    const asSocial = (d: unknown) => (d && typeof d === 'object' ? (d as SocialData) : null)
    return {
      id: p.id, version_no: p.version_no, submitted_at: p.submitted_at, student, hasCurrent: approved != null, profileDiff, medDiff, prev,
      approvedSocial: asSocial(approved?.social_status_data), newSocial: asSocial(p.social_status_data),
    }
  })
}

function DiffTable({ rows, title, onlyChanged, beforeLabel = 'Чинна версія', afterLabel = 'Нова версія' }: {
  rows: FieldDiff[]; title: string; onlyChanged: boolean; beforeLabel?: string; afterLabel?: string
}) {
  const shown = onlyChanged ? rows.filter((r) => r.changed) : rows
  return (
    <div className="table-wrap">
      <table className="data diff">
        <colgroup><col className="c-field" /><col className="c-two" /><col className="c-two" /></colgroup>
        <caption className="sr-only">{title}</caption>
        <thead><tr><th scope="col">Поле</th><th scope="col">{beforeLabel}</th><th scope="col">{afterLabel}</th></tr></thead>
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

type Item = NonNullable<Awaited<ReturnType<typeof loadPending>>>[number]

function ApprovalCard({ item, onlyChanged, busy, onApprove, onReject }: {
  item: Item
  onlyChanged: boolean
  busy: boolean
  onApprove: (rpc: 'simple' | { values: Record<string, string>; choices: Record<string, string>; social: SocialData | null }) => void
  onReject: () => void
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [edits, setEdits] = useState<Record<string, string>>({})
  const rows = useMemo(() => [...item.profileDiff, ...item.medDiff], [item])
  const plan = useMemo(() => buildPlan(rows, choices, edits), [rows, choices, edits])
  const n = changedCount(item.profileDiff) + changedCount(item.medDiff)

  const toggle = (row: FieldDiff, side: 'old' | 'new') => {
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== row.key)))
    setChoices((prev) => ({
      ...prev,
      [row.key]: toggleChoice(prev[row.key] ?? defaultChoice(row.before, row.after), side, MERGEABLE.has(row.key)),
    }))
  }
  const edit = (row: FieldDiff, value: string) => setEdits((prev) => ({ ...prev, [row.key]: value }))

  function approve() {
    if (!item.hasCurrent) return onApprove('simple')
    const rec = plan.choices.social_status
    const c = choices.social_status
    const kind = rec === 'edited' ? (c ? (c.old && c.new ? 'both' : c.old ? 'old' : 'new') : 'new') : rec
    onApprove({
      values: plan.values,
      choices: plan.choices,
      social: kind ? mergeSocialData(item.approvedSocial, item.newSocial, kind as 'old' | 'new' | 'both') : null,
    })
  }

  return (
    <article className="ap-item" aria-labelledby={`h-${item.id}`}>
      <div className="approval-head">
        <div className="approval-title">
          <h2 id={`h-${item.id}`}><Link to={`/students/${item.student.id}`}>{fullName(item.student)}</Link></h2>
          <p className="muted small">
            Версія {item.version_no} · подано {formatDateTime(item.submitted_at)} · змінених полів: {n}
            {!item.hasCurrent && ' · чинної версії ще немає (перша анкета)'}
          </p>
        </div>
        <div className="approval-actions">
          <button type="button" className="btn-outline-danger" disabled={busy} onClick={onReject}>Відхилити</button>
          <button type="button" disabled={busy} onClick={approve}>Підтвердити</button>
        </div>
      </div>
      {item.hasCurrent && n > 0 && (
        <p className="muted small merge-help">
          Познач галочками, що залишити: стару відповідь, нову або <strong>обидві</strong> (запишеться «стара, нова»). Приглушений текст у чинну анкету не потрапить.
          {' '}Підсумок: з нової — {plan.newCount}, зі старої — {plan.oldCount}, обох разом — {plan.bothCount}.
        </p>
      )}
      {item.prev && (() => {
        const pn = item.prev.version_no
        const prevRows = [...item.prev.diff, ...item.prev.medDiff]
        const pc = changedCount(prevRows)
        return (
          <div className="notice" role="note">
            {pc === 0 ? (
              <p><strong>Дубль:</strong> ця версія повністю збігається з версією {pn}, поданою {formatDateTime(item.prev.submitted_at)}. Достатньо обробити одну з них.</p>
            ) : (
              <>
                <p><strong>Повторне подання:</strong> цей учень уже надсилав версію {pn} ({formatDateTime(item.prev.submitted_at)}), яка ще не оброблена. У версії {item.version_no} змінено полів: {pc}.</p>
                <DiffTable rows={prevRows} title={`Зміни у версії ${item.version_no} порівняно з версією ${pn}`} onlyChanged
                  beforeLabel={`Версія ${pn}`} afterLabel={`Версія ${item.version_no}`} />
              </>
            )}
          </div>
        )
      })()}
      {item.hasCurrent ? (
        <MergeTable rows={item.profileDiff} title="Порівняння анкети: вибір значень" onlyChanged={onlyChanged} choices={choices} edits={edits} onToggle={toggle} onEdit={edit} />
      ) : (
        <DiffTable rows={item.profileDiff} title="Порівняння анкети" onlyChanged={false} />
      )}
      {item.medDiff.length > 0 && (
        <>
          <h3>Медична інформація (з поданої анкети)</h3>
          {item.hasCurrent || item.medDiff.some((r) => r.before)
            ? <MergeTable rows={item.medDiff} title="Порівняння медичних даних: вибір значень" onlyChanged={false} choices={choices} edits={edits} onToggle={toggle} onEdit={edit} />
            : <DiffTable rows={item.medDiff} title="Порівняння медичних даних" onlyChanged={false} />}
        </>
      )}
    </article>
  )
}

export function ApprovalsPage() {
  const { data, error, loading, reload } = useLoad(loadPending, 'pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [onlyChanged, setOnlyChanged] = useState(true)

  async function approve(id: string, how: Parameters<typeof ApprovalCard>[0]['onApprove'] extends (a: infer A) => void ? A : never) {
    setBusyId(id); setActionError(null)
    const { error: err } = how === 'simple'
      ? await supabase.rpc('approve_student_profile', { p_profile_id: id })
      : await supabase.rpc('approve_student_profile_merged', {
          p_profile_id: id, p_values: how.values as Json, p_choices: how.choices as Json, p_social_data: (how.social ?? null) as Json,
        })
    setBusyId(null)
    if (err) setActionError(errorMessage(err))
    reload()
    notifyPendingChanged()
  }

  async function reject(id: string) {
    if (!window.confirm('Відхилити цю версію? Чинна анкета залишиться без змін.')) return
    setBusyId(id); setActionError(null)
    const { error: err } = await supabase.rpc('reject_student_profile', { p_profile_id: id })
    setBusyId(null)
    if (err) setActionError(errorMessage(err))
    reload()
    notifyPendingChanged()
  }

  return (
    <section className="fill-page st-page ap-page">
      <div className="page-head">
        <h1>Оновлення даних</h1>
        <label className="check"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Лише змінені поля</label>
      </div>
      {/* Одна біла плашка на висоту екрана; анкети гортаються всередині неї */}
      <ScrollArea className="st-scroll ap-scroll" body="ap-body">
        {loading && <p className="muted">Завантаження…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {actionError && <p className="error" role="alert">{actionError}</p>}
        {data && data.length === 0 && <p className="muted">Немає версій, що чекають підтвердження.</p>}
        {data?.map((item) => (
          <ApprovalCard key={item.id} item={item} onlyChanged={onlyChanged} busy={busyId === item.id}
            onApprove={(how) => void approve(item.id, how)} onReject={() => void reject(item.id)} />
        ))}
      </ScrollArea>
    </section>
  )
}
