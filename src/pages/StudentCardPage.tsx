import { useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DrawerTitleSlot } from '../components/ui/drawerContext'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PhoneLink } from '../components/PhoneLink'
import { StatusBadge } from '../components/StatusBadge'
import { fullName, formatDate, isStudentStatus } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

type RoomRef = { number: string; floor: number } | null

async function loadCard(id: string, withMedical: boolean) {
  const [st, asg, ver, med] = await Promise.all([
    supabase.from('students').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('room_assignments')
      .select('id,to_date, rooms!room_assignments_room_id_fkey(number,floor)')
      .eq('student_id', id)
      .order('from_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('student_profiles')
      .select('*')
      .eq('student_id', id)
      .order('version_no', { ascending: false }),
    withMedical
      ? supabase
          .from('student_medical')
          .select('*')
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

/** Картка учня: окрема сторінка (/students/:id) або вміст бічної шухляди (`studentId` + `embedded`). Максимально проста: контакти, анкета, медична інформація (лише якщо є). */
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
  const hasMedical = !!(medical && [medical.allergies, medical.chronic_conditions, medical.notes].some((v) => v && v.trim()))
  const shownContacts = contacts.filter((c) => c.phone || (c.label !== 'Учень' && c.name))
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
      {!embedded && <p><Link to="/students" className="back-link">← До списку</Link></p>}
      <div className="page-head">
        <h1 ref={embedded ? setH1 : undefined}>{name} <StatusBadge status={status} /></h1>
        {canEdit && <Link className="btn secondary" to={`/students/${id}/edit`}>Редагувати</Link>}
      </div>
      <p className="muted">
        {student.grade} клас · народився {formatDate(student.birth_date)} ·{' '}
        {room ? <>кімната <strong>{room.number}</strong>, {room.floor} поверх</> : <span className="tag tag-unplaced">нерозподілений</span>}
      </p>

      {student.notes?.trim() && (
        <p className="banner warn card-note"><strong>Примітка:</strong> {student.notes}</p>
      )}

      <section className="panel" aria-labelledby="contacts-h">
        <h2 id="contacts-h">Контакти</h2>
        {!current && <p className="muted">Затвердженої анкети ще немає — контактів немає.</p>}
        {current && shownContacts.length === 0 && <p className="muted">Контактів в анкеті немає.</p>}
        {current && shownContacts.length > 0 && <table className="contacts-table">
          <thead className="sr-only"><tr><th scope="col">Хто</th><th scope="col">Телефон</th></tr></thead>
          <tbody>
            {shownContacts.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}{c.label !== 'Учень' && c.name && <span className="ct-name">{c.name}</span>}</th>
                <td className="ct-phone"><PhoneLink phone={c.phone} label={`${c.label} ${c.name ?? ''}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>}
      </section>

      <section className="panel" aria-labelledby="profile-h">
        <h2 id="profile-h">Анкета</h2>
        {current ? (
          <dl className="kv">
            {answers.filter(([, v]) => v && v.trim()).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
        ) : <p className="muted">Затверджена анкета відсутня.</p>}
      </section>

      {canEdit && hasMedical && (
        <section className="panel" aria-labelledby="med-h">
          <h2 id="med-h">Медична інформація</h2>
          <dl className="kv">
            {medical?.allergies?.trim() && <div><dt>Алергії</dt><dd>{medical.allergies}</dd></div>}
            {medical?.chronic_conditions?.trim() && <div><dt>Хронічні хвороби</dt><dd>{medical.chronic_conditions}</dd></div>}
            {medical?.notes?.trim() && <div><dt>Примітки</dt><dd>{medical.notes}</dd></div>}
          </dl>
        </section>
      )}
    </article>
  )
}
