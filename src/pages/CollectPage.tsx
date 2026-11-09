import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  activeLinkForFloor, ANSWER_FIELDS, campaignSince, filledStudentIds, linkState, notFilledByFloor, shareMessage, suggestCandidates, unmatchedReason,
  type IntakeLink,
} from '../lib/collect'
import { errorMessage, fullName, formatDate, formatDateTime } from '../lib/format'
import { buildFormLink } from '../lib/links'
import { notifyPendingChanged } from '../lib/pending'
import { fetchStudentRows } from '../lib/studentsApi'
import type { StudentRow } from '../lib/studentsList'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

const FLOORS = [2, 3, 4, 5]
const TTL_OPTIONS = [3, 7, 14, 30]

async function loadCollect() {
  const [links, subs, students, profiles] = await Promise.all([
    supabase.from('intake_links').select('id,floor,expires_at,revoked_at,max_submissions,created_at').order('created_at', { ascending: false }).limit(60),
    supabase
      .from('intake_submissions')
      .select('id,link_id,submitted_at,submitted_full_name,submitted_birth_date,status,match_method,student_id,profile_id,payload')
      .order('submitted_at', { ascending: false })
      .limit(500),
    fetchStudentRows(),
    supabase.from('student_profiles').select('id,student_id,status,submitted_at').limit(5000),
  ])
  if (links.error) throw links.error
  if (subs.error) throw subs.error
  if (profiles.error) throw profiles.error
  return { links: links.data as IntakeLink[], subs: subs.data, students, profiles: profiles.data }
}

type Data = Awaited<ReturnType<typeof loadCollect>>
type Sub = Data['subs'][number]

const RESULT_LABELS: Record<string, string> = {
  auto: 'зіставлено автоматично', manual: 'зіставлено вручну', new_student: 'створено нового учня',
}
const VERSION_LABELS: Record<string, string> = {
  pending: 'очікує підтвердження', approved: 'підтверджено', superseded: 'застаріла', rejected: 'відхилено',
}

export function CollectPage() {
  const { data, error, loading, reload } = useLoad(loadCollect, 'collect')
  const [actionError, setActionError] = useState<string | null>(null)

  const done = () => {
    notifyPendingChanged()
    reload()
  }

  return (
    <section>
      <h1>Збір анкет</h1>
      <p className="muted">
        Одне посилання на поверх: надішліть його в чат поверху, і кожен учень заповнить свою анкету. Анкета сама прикріпляється до учня в базі, якщо
        ПІБ і дата народження збігаються точно; інакше потрапляє в «Не зіставлені». Підтверджує анкети завжди вихователь — на сторінці «Оновлення даних».
      </p>
      {loading && <p className="muted">Завантаження…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {data && (
        <>
          <FloorLinks data={data} onChanged={reload} onError={setActionError} />
          <Unmatched data={data} onDone={done} onError={setActionError} />
          <Progress data={data} />
          <Journal data={data} />
        </>
      )}
    </section>
  )
}

function FloorLinks({ data, onChanged, onError }: { data: Data; onChanged: () => void; onError: (m: string | null) => void }) {
  const [ttl, setTtl] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [fresh, setFresh] = useState<Record<number, { link: string; expires: string }>>({})
  const [copied, setCopied] = useState<number | null>(null)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of data.subs) m.set(s.link_id, (m.get(s.link_id) ?? 0) + 1)
    return m
  }, [data.subs])

  async function create(floor: number, replacing: boolean) {
    if (replacing && !window.confirm('Старе посилання цього поверху перестане працювати. Видати нове?')) return
    setBusy(floor); onError(null); setCopied(null)
    const days = ttl[floor] ?? 7
    const { data: token, error: err } = await supabase.rpc('create_intake_link', { p_floor: floor, p_ttl_days: days })
    setBusy(null)
    if (err || !token) return onError(errorMessage(err))
    setFresh((f) => ({ ...f, [floor]: { link: buildFormLink(token), expires: new Date(Date.now() + days * 86_400_000).toISOString() } }))
    onChanged()
  }

  async function revoke(floor: number, id: string) {
    if (!window.confirm('Скасувати посилання? Ним більше не можна буде заповнити анкету.')) return
    setBusy(floor); onError(null)
    const { error: err } = await supabase.rpc('revoke_intake_link', { p_link_id: id })
    setBusy(null)
    if (err) return onError(errorMessage(err))
    setFresh((f) => { const n = { ...f }; delete n[floor]; return n })
    onChanged()
  }

  async function copy(floor: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(floor)
    } catch {
      onError('Не вдалося скопіювати — виділіть текст вручну.')
    }
  }

  async function share(text: string) {
    try {
      await navigator.share({ text })
    } catch {
      /* вікно «Поділитися» закрито */
    }
  }

  return (
    <section className="panel" aria-labelledby="floors-h">
      <h2 id="floors-h">Посилання по поверхах</h2>
      <div className="floor-grid">
        {FLOORS.map((floor) => {
          const active = activeLinkForFloor(data.links, floor)
          const f = fresh[floor]
          const msg = f ? shareMessage(f.link, f.expires) : ''
          return (
            <article key={floor} className="floor-card" aria-label={`${floor} поверх`}>
              <h3>{floor} поверх</h3>
              {active ? (
                <p className="small">
                  <span className="tag tag-active">діє</span> до {formatDateTime(active.expires_at)}
                  <br />подань: {counts.get(active.id) ?? 0} з {active.max_submissions}
                </p>
              ) : (
                <p className="small muted">Діючого посилання немає.</p>
              )}
              {f && (
                <div className="notice" role="status">
                  <p className="small"><strong>Скопіюйте й надішліть у чат поверху.</strong> Після закриття сторінки це посилання вже не побачити — видайте нове.</p>
                  <input readOnly value={f.link} onFocus={(e) => e.currentTarget.select()} aria-label={`Посилання для ${floor} поверху`} />
                  <div className="row actions">
                    <button type="button" className="secondary" onClick={() => void copy(floor, msg)}>{copied === floor ? 'Скопійовано ✓' : 'Копіювати з текстом'}</button>
                    {typeof navigator.share === 'function' && <button type="button" onClick={() => void share(msg)}>Поділитися</button>}
                  </div>
                </div>
              )}
              <div className="row">
                <label className="inline">
                  Діє
                  <select value={ttl[floor] ?? 7} onChange={(e) => setTtl((t) => ({ ...t, [floor]: Number(e.target.value) }))}>
                    {TTL_OPTIONS.map((d) => <option key={d} value={d}>{d} дн.</option>)}
                  </select>
                </label>
              </div>
              <div className="row actions">
                <button type="button" disabled={busy === floor} onClick={() => void create(floor, !!active)}>
                  {active ? 'Видати нове' : 'Створити посилання'}
                </button>
                {active && (
                  <button type="button" className="btn-danger" disabled={busy === floor} onClick={() => void revoke(floor, active.id)}>Скасувати</button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Unmatched({ data, onDone, onError }: { data: Data; onDone: () => void; onError: (m: string | null) => void }) {
  const queue = data.subs.filter((s) => s.status === 'unmatched').slice().reverse()
  return (
    <section className="panel" aria-labelledby="unmatched-h">
      <h2 id="unmatched-h">Не зіставлені ({queue.length})</h2>
      {queue.length === 0 ? (
        <p className="muted">Усі подані анкети зіставлено.</p>
      ) : (
        <>
          <p className="muted small">Не вдалося точно знайти учня за ПІБ і датою народження (помилка в написанні, інша дата, є тезка, учня ще немає в базі).</p>
          {queue.map((s) => (
            <UnmatchedCard key={s.id} sub={s} students={data.students} onDone={onDone} onError={onError} />
          ))}
        </>
      )}
    </section>
  )
}

function UnmatchedCard({ sub, students, onDone, onError }: {
  sub: Sub; students: StudentRow[]; onDone: () => void; onError: (m: string | null) => void
}) {
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState('10')
  const [busy, setBusy] = useState(false)
  const payload = (sub.payload ?? {}) as Record<string, unknown>
  const reason = useMemo(() => unmatchedReason({ name: sub.submitted_full_name, birth_date: sub.submitted_birth_date }, students), [sub, students])
  const candidates = useMemo(
    () => suggestCandidates({ name: sub.submitted_full_name, birth_date: sub.submitted_birth_date }, students),
    [sub, students],
  )
  const found = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return students.filter((s) => s.status === 'active' && fullName(s).toLowerCase().includes(t)).slice(0, 8)
  }, [q, students])

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true); onError(null)
    const { error: err } = await fn()
    setBusy(false)
    if (err) return onError(errorMessage(err))
    onDone()
  }

  const pick = (s: StudentRow) => (
    <li key={s.id} className="candidate">
      <span>
        <strong>{fullName(s)}</strong>, {s.grade} кл. {s.room ? `· кімн. ${s.room}` : '· без кімнати'} · {s.birth_date ? formatDate(s.birth_date) : 'дата народження не вказана'}
      </span>
      <button type="button" disabled={busy} onClick={() => void run(() => supabase.rpc('resolve_intake_submission', { p_submission_id: sub.id, p_student_id: s.id }))}>
        Це він(вона)
      </button>
    </li>
  )

  return (
    <article className="subcard" aria-label={`Подання: ${sub.submitted_full_name}`}>
      <h3>{sub.submitted_full_name} <span className="muted small">· нар. {formatDate(sub.submitted_birth_date)}</span></h3>
      <p className="muted small">Подано {formatDateTime(sub.submitted_at)}</p>
      <p className="reason" role="note"><strong>Чому не зіставлено:</strong> {reason}</p>
      <details className="full-answers" open>
        <summary>Повна анкета, яку заповнив(ла) учень</summary>
        <dl className="kv">
          {ANSWER_FIELDS.map((f) => {
            const raw = f.key === 'birth_date' ? sub.submitted_birth_date : payload[f.key]
            const text = raw == null || raw === '' ? '—' : f.key === 'birth_date' ? formatDate(String(raw)) : String(raw)
            return <div key={f.key}><dt>{f.label}{f.medical ? ' (медична інформація)' : ''}</dt><dd>{text}</dd></div>
          })}
        </dl>
      </details>
      {candidates.length > 0 && (<><h4>Схожі учні</h4><ul className="plain">{candidates.map(pick)}</ul></>)}
      <label>Знайти учня в базі
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Прізвище або імʼя" />
      </label>
      {found.length > 0 && <ul className="plain">{found.map(pick)}</ul>}
      <p className="muted small hint-line">Якщо це не той, хто в базі: створіть нового учня з цих даних. Якщо подання помилкове або це сміття — відхиліть (відповіді буде видалено).</p>
      <div className="row actions">
        <label className="inline">Клас нового
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {[9, 10, 11].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <button type="button" className="secondary" disabled={busy}
          onClick={() => { if (window.confirm('Створити нового учня з цими даними?')) void run(() => supabase.rpc('create_student_from_intake', { p_submission_id: sub.id, p_grade: Number(grade) })) }}>
          Створити нового учня
        </button>
        <button type="button" className="btn-danger" disabled={busy}
          onClick={() => { if (window.confirm('Відхилити це подання як помилкове/сміття? Відповіді буде видалено.')) void run(() => supabase.rpc('dismiss_intake_submission', { p_submission_id: sub.id })) }}>
          Відхилити подання (помилка / сміття)
        </button>
      </div>
    </article>
  )
}

function Progress({ data }: { data: Data }) {
  const since = campaignSince(data.links)
  const filled = useMemo(() => filledStudentIds(data.profiles, since), [data.profiles, since])
  const groups = useMemo(() => notFilledByFloor(data.students, filled), [data.students, filled])
  const active = data.students.filter((s) => s.status === 'active')
  const left = groups.reduce((n, g) => n + g.students.length, 0)
  return (
    <section className="panel" aria-labelledby="progress-h">
      <h2 id="progress-h">Хто ще не заповнив</h2>
      <p className="muted small">
        Заповнили: {active.length - left} з {active.length} активних учнів
        {since ? ` (з ${formatDate(since.toISOString())})` : ''}. Враховано будь-яку подану анкету, крім відхилених.
      </p>
      {groups.length === 0 ? <p className="muted">Усі активні учні вже подали анкету.</p> : groups.map((g) => (
        <details key={g.key}>
          <summary>{g.title} — {g.students.length}</summary>
          <ul className="plain">
            {g.students.map((s) => <li key={s.id}><Link to={`/students/${s.id}`}>{fullName(s)}</Link>, {s.grade} кл.{s.room ? ` · кімн. ${s.room}` : ''}</li>)}
          </ul>
        </details>
      ))}
    </section>
  )
}

function Journal({ data }: { data: Data }) {
  const [all, setAll] = useState(false)
  const students = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students])
  const links = useMemo(() => new Map(data.links.map((l) => [l.id, l])), [data.links])
  const profiles = useMemo(() => new Map(data.profiles.map((p) => [p.id, p])), [data.profiles])
  const rows = all ? data.subs : data.subs.slice(0, 30)
  return (
    <section className="panel" aria-labelledby="journal-h">
      <h2 id="journal-h">Хто заповнив (журнал)</h2>
      {data.subs.length === 0 ? <p className="muted">Подань за спільними посиланнями ще немає.</p> : (
        <>
          <div className="table-wrap">
            <table className="data cards-on-mobile">
              <thead><tr><th scope="col">Час</th><th scope="col">Як вказав(ла)</th><th scope="col">Поверх</th><th scope="col">Результат</th><th scope="col">Учень у базі</th><th scope="col">Анкета</th></tr></thead>
              <tbody>
                {rows.map((s) => {
                  const st = s.student_id ? students.get(s.student_id) : undefined
                  const l = links.get(s.link_id)
                  const pv = s.profile_id ? profiles.get(s.profile_id) : undefined
                  return (
                    <tr key={s.id}>
                      <td data-label="Час">{formatDateTime(s.submitted_at)}</td>
                      <td data-label="Як вказав(ла)">{s.submitted_full_name}, {formatDate(s.submitted_birth_date)}</td>
                      <td data-label="Поверх">{l?.floor ?? '—'}{l && linkState(l) !== 'active' ? ` (${linkState(l) === 'revoked' ? 'скасовано' : 'прострочено'})` : ''}</td>
                      <td data-label="Результат">
                        {s.status === 'unmatched' ? <span className="tag tag-unplaced">не зіставлено</span>
                          : s.status === 'dismissed' ? <span className="tag tag-left">відхилено</span>
                          : (RESULT_LABELS[s.match_method ?? ''] ?? 'зіставлено')}
                      </td>
                      <td data-label="Учень у базі">{st ? <Link to={`/students/${st.id}`}>{fullName(st)}</Link> : '—'}</td>
                      <td data-label="Анкета">{pv ? VERSION_LABELS[pv.status] ?? pv.status : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.subs.length > 30 && (
            <button type="button" className="secondary" onClick={() => setAll((v) => !v)}>{all ? 'Показати лише останні' : `Показати всі (${data.subs.length})`}</button>
          )}
        </>
      )}
    </section>
  )
}
