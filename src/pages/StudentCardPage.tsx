import { useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DrawerTitleSlot } from '../components/ui/drawerContext'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PhoneLink } from '../components/PhoneLink'
import { StatusBadge } from '../components/StatusBadge'
import { UpdateLinksPanel } from '../components/UpdateLinksPanel'
import { fullName, formatDate, formatDateTime, isStudentStatus } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

const VERSION_LABELS: Record<string, string> = {
  approved: 'чинна', superseded: 'застаріла', pending: 'очікує підтвердження', rejected: 'відхилена',
}

type RoomRef = { number: string; floor: number } | null
type Named = { full_name: string } | null

async function loadCard(id: string, withMedical: boolean) {
  const [st, asg, ver, med] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('room_assignments')
      .select('id,from_date,to_date,reason,end_reason, rooms!room_assignments_room_id_fkey(number,floor), mover:profiles!room_assignments_moved_by_fkey(full_name), ender:profiles!room_assignments_ended_by_fkey(full_name)')
      .eq('student_id', id)
      .order('from_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('student_profiles')
      .select('*, approver:profiles!student_profiles_approved_by_fkey(full_name), rejecter:profiles!student_profiles_rejected_by_fkey(full_name)')
      .eq('student_id', id)
      .order('version_no', { ascending: false }),
    withMedical
      ? supabase
          .from('student_medical')
          .select('*, creator:profiles!student_medical_created_by_fkey(full_name), updater:profiles!student_medical_updated_by_fkey(full_name)')
          .eq('student_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (st.error) throw st.error
  if (!st.data) throw new Error('NOT_FOUND')
  if (asg.error) throw asg.error
  if (ver.error) throw ver.error
  if (med.error) throw med.error
  return { student: st.data, assignments: asg.data, versions: ver.data, medical: med.data }
}

/** Картка учня: окрема сторінка (/students/:id) або вміст бічної шухляди (`studentId` + `embedded`). */
/** Додатковий розділ: на окремій сторінці — звичайна панель, у шухляді — згорнута (щоб не перевантажувати картку). */
function Extra({ id, title, embedded, children }: { id: string; title: string; embedded: boolean; children: ReactNode }) {
  if (!embedded) return <section className="panel" aria-labelledby={id}><h2 id={id}>{title}</h2>{children}</section>
  return <details className="panel fold"><summary id={id}>{title}</summary>{children}</details>
}

export function StudentCardPage({ studentId, embedded = false }: { studentId?: string; embedded?: boolean } = {}) {
  const params = useParams<{ id: string }>()
  const id = studentId ?? params.id ?? ''
  const { profile } = useAuth()
  const role = profile?.role
  const canEdit = role === 'admin' || role === 'educator'
  const { data, error, loading } = useLoad(() => loadCard(id, canEdit), `${id}:${canEdit}`)
  // У шухляді: коли великий заголовок прокрутили за верхній край, ім'я учня з'являється у шапці поруч із хрестиком.
  const slot = useContext(DrawerTitleSlot)
  const [h1, setH1] = useState<HTMLElement | null>(null)
  const [scrolledPast, setScrolledPast] = useState(false)
  useEffect(() => {
    const root = h1?.closest<HTMLElement>('.scrollrows')
    if (!h1 || !root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setScrolledPast(!e.isIntersecting), { root, threshold: 0 })
    io.observe(h1)
    return () => io.disconnect()
  }, [h1])

  if (loading) return <p className="muted">Завантаження…</p>
  if (error || !data) return <p className="error" role="alert">{error === 'NOT_FOUND' ? 'Учня не знайдено.' : error}</p>

  const { student, assignments, versions, medical } = data
  const current = versions.find((v) => v.status === 'approved') ?? null
  const open = assignments.find((a) => a.to_date == null) ?? null
  const room = open?.rooms as unknown as RoomRef
  const status = isStudentStatus(student.status) ? student.status : 'active'
  const name = fullName(student)

  const contacts: { label: string; name: string | null; phone: string | null }[] = [
    { label: 'Учень', name, phone: current?.student_phone ?? null },
    { label: 'Мама', name: current?.mother_name ?? null, phone: current?.mother_phone ?? null },
    { label: 'Тато', name: current?.father_name ?? null, phone: current?.father_phone ?? null },
    { label: current?.guardian_relation ? `Опікун (${current.guardian_relation})` : 'Опікун', name: current?.guardian_name ?? null, phone: current?.guardian_phone ?? null },
  ]
  const answers: [string, string | null | undefined][] = current
    ? [
        ['Номер групи', current.group_number], ['Професія', current.profession],
        ['Класний керівник', current.class_teacher], ['Майстер', current.master],
        ['Адреса проживання', current.address], ['Чим займався у школі', current.school_activities],
        ['Чим хоче займатися у коледжі', current.college_plans], ['Соціальний статус', current.social_status],
      ]
    : []

  return (
    <article className="card-page">
      {embedded && slot && createPortal(
        <span className={`drawer-title${scrolledPast ? ' on' : ''}`} aria-hidden={!scrolledPast}>
          <strong>{name}</strong> <StatusBadge status={status} />
        </span>,
        slot,
      )}
      {!embedded && <p><Link to="/students">← До списку</Link></p>}
      <div className="page-head">
        <h1 ref={embedded ? setH1 : undefined}>{name} <StatusBadge status={status} /></h1>
        {canEdit && <Link className="btn secondary" to={`/students/${id}/edit`}>Редагувати</Link>}
      </div>
      <p className="muted">
        {student.grade} клас · народився {formatDate(student.birth_date)} ·{' '}
        {room ? <>кімната <strong>{room.number}</strong>, {room.floor} поверх</> : <span className="tag tag-unplaced">нерозподілений</span>}
      </p>

      <section className="panel" aria-labelledby="contacts-h">
        <h2 id="contacts-h">Контакти</h2>
        {!current && <p className="muted">Затвердженої анкети ще немає — контактів немає.</p>}
        <ul className="contacts">
          {contacts.map((c) => (
            <li key={c.label}>
              <span className="muted">{c.label}</span>
              <span>{c.label === 'Учень' ? '' : c.name ?? ''}</span>
              <PhoneLink phone={c.phone} label={`${c.label} ${c.name ?? ''}`} />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="profile-h">
        <h2 id="profile-h">Анкета{current && <span className="muted small"> · версія {current.version_no}, затверджена {formatDateTime(current.approved_at)}</span>}</h2>
        {current ? (
          <dl className="kv">
            {answers.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>))}
          </dl>
        ) : <p className="muted">Затверджена анкета відсутня.</p>}
      </section>

      {canEdit && (
        <Extra id="med-h" title="Медична інформація" embedded={embedded}>
          {medical ? (
            <>
              <dl className="kv">
                <div><dt>Алергії</dt><dd>{medical.allergies || '—'}</dd></div>
                <div><dt>Хронічні хвороби</dt><dd>{medical.chronic_conditions || '—'}</dd></div>
                <div><dt>Примітки</dt><dd>{medical.notes || '—'}</dd></div>
              </dl>
              <p className="muted small">
                Внесено: {(medical.creator as unknown as Named)?.full_name ?? '—'} · востаннє змінено: {(medical.updater as unknown as Named)?.full_name ?? 'учнем/системою'}, {formatDateTime(medical.updated_at)}
              </p>
            </>
          ) : <p className="muted">Медичних даних немає.</p>}
          <p className="muted small">Видно лише адміністраторам і вихователям.</p>
        </Extra>
      )}

      {canEdit && status === 'active' && (embedded
        ? <details className="panel fold"><summary>Оновлення даних учнем</summary><UpdateLinksPanel studentId={id} canCreate /></details>
        : <UpdateLinksPanel studentId={id} canCreate />)}

      <Extra id="rooms-h" title="Історія кімнат" embedded={embedded}>
        {assignments.length === 0 ? <p className="muted">Ще не заселявся.</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Історія кімнат">
            <table className="data">
              <thead><tr><th scope="col">Кімната</th><th scope="col">З</th><th scope="col">По</th><th scope="col">Хто / чому</th></tr></thead>
              <tbody>
                {assignments.map((a) => {
                  const r = a.rooms as unknown as RoomRef
                  return (
                    <tr key={a.id}>
                      <td>{r ? `${r.number} (${r.floor} пов.)` : '—'}</td>
                      <td>{formatDate(a.from_date)}</td>
                      <td>{a.to_date ? formatDate(a.to_date) : 'тепер'}</td>
                      <td>
                        {(a.mover as unknown as Named)?.full_name ?? '—'}{a.reason ? ` — ${a.reason}` : ''}
                        {a.to_date && (<><br /><span className="muted small">виселив: {(a.ender as unknown as Named)?.full_name ?? '—'}{a.end_reason ? ` — ${a.end_reason}` : ''}</span></>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Extra>

      <Extra id="hist-h" title="Версії анкети" embedded={embedded}>
        {versions.length === 0 ? <p className="muted">Версій немає.</p> : (
          <ul className="plain versions">
            {versions.map((v) => {
              const by = v.status === 'rejected' ? (v.rejecter as unknown as Named) : (v.approver as unknown as Named)
              return (
                <li key={v.id}>
                  <strong>Версія {v.version_no}</strong>{' '}
                  <span className={`tag tag-v-${v.status}`}>{VERSION_LABELS[v.status] ?? v.status}</span>
                  <span className="muted small">
                    {' '}· подано {formatDateTime(v.submitted_at)}
                    {v.status === 'approved' || v.status === 'superseded' ? ` · затвердив(ла): ${by?.full_name ?? '—'}, ${formatDateTime(v.approved_at)}` : ''}
                    {v.status === 'rejected' ? ` · відхилив(ла): ${by?.full_name ?? '—'}, ${formatDateTime(v.rejected_at)}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {canEdit && versions.some((v) => v.status === 'pending') && <p><Link to="/updates">Є версії, що чекають підтвердження →</Link></p>}
      </Extra>
    </article>
  )
}
