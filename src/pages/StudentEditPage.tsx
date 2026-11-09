import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { BirthDateField } from '../components/BirthDateField'
import { errorMessage, isStudentStatus, STATUS_LABELS, type StudentStatus } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'

interface FormState {
  last_name: string
  first_name: string
  patronymic: string
  birth_date: string
  grade: string
  status: StudentStatus
}
const EMPTY: FormState = { last_name: '', first_name: '', patronymic: '', birth_date: '', grade: '9', status: 'active' }

/** Створення (/students/new) і редагування (/students/:id/edit) базових даних учня. */
export function StudentEditPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'educator'
  const existing = useLoad(async () => {
    if (!id) return null
    const { data, error } = await supabase.from('students').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('NOT_FOUND')
    const open = await supabase.from('room_assignments').select('id').eq('student_id', id).is('to_date', null).maybeSingle()
    return { student: data, placed: open.data != null }
  }, id ?? 'new')

  if (!canEdit) return <p className="error">Недостатньо прав для редагування.</p>
  if (id && existing.loading) return <p className="muted">Завантаження…</p>
  if (id && existing.error) return <p className="error" role="alert">{existing.error}</p>

  const s = existing.data?.student
  const initial: FormState = s
    ? {
        last_name: s.last_name, first_name: s.first_name, patronymic: s.patronymic ?? '', birth_date: s.birth_date ?? '',
        grade: String(s.grade), status: isStudentStatus(s.status) ? s.status : 'active',
      }
    : EMPTY
  return <EditForm key={id ?? 'new'} id={id} initial={initial} placed={existing.data?.placed ?? false} />
}

function EditForm({ id, initial, placed }: { id?: string; initial: FormState; placed: boolean }) {
  const navigate = useNavigate()
  const [f, setF] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dateIncomplete, setDateIncomplete] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!f.last_name.trim()) errs.last_name = "Обов'язкове поле"
    if (!f.first_name.trim()) errs.first_name = "Обов'язкове поле"
    if (dateIncomplete) errs.birth_date = 'Оберіть день, місяць і рік (або приберіть усі три)'
    else if (f.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date)) errs.birth_date = 'Некоректна дата'
    setErrors(errs)
    if (Object.keys(errs).length) return

    const leaving = f.status !== 'active' && initial.status === 'active' && placed
    if (leaving && !window.confirm('Учень буде виселений з кімнати та повернутий у пул нерозподілених (історія збережеться). Продовжити?')) return

    setSaving(true); setServerError(null)
    const base = {
      last_name: f.last_name.trim(), first_name: f.first_name.trim(), patronymic: f.patronymic.trim() || null,
      birth_date: f.birth_date || null, grade: Number(f.grade), status: f.status,
    }
    if (!id) {
      const year = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle()
      const { data, error } = await supabase.from('students').insert({ ...base, academic_year_id: year.data?.id ?? null }).select('id').single()
      setSaving(false)
      if (error) return setServerError(errorMessage(error))
      navigate(`/students/${data.id}`)
      return
    }
    const { error } = await supabase.from('students').update(base).eq('id', id)
    if (error) { setSaving(false); return setServerError(errorMessage(error)) }
    if (leaving) {
      const r = await supabase.rpc('unassign_student', { p_student_id: id, p_reason: `Статус змінено на «${STATUS_LABELS[f.status]}»` })
      if (r.error) { setSaving(false); return setServerError(`Дані збережено, але виселити з кімнати не вдалося: ${errorMessage(r.error)}`) }
    }
    setSaving(false)
    navigate(`/students/${id}`)
  }

  const field = (k: keyof FormState, label: string, input: React.ReactNode) => (
    <label>{label}{input}{errors[k] && <span className="field-error" id={`e-${k}`}>{errors[k]}</span>}</label>
  )

  return (
    <section>
      <h1>{id ? 'Редагування учня' : 'Новий учень'}</h1>
      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        {field('last_name', 'Прізвище *', <input value={f.last_name} onChange={(e) => set('last_name', e.target.value)} autoComplete="off" aria-invalid={!!errors.last_name} aria-describedby={errors.last_name ? 'e-last_name' : undefined} />)}
        {field('first_name', "Ім'я *", <input value={f.first_name} onChange={(e) => set('first_name', e.target.value)} autoComplete="off" aria-invalid={!!errors.first_name} aria-describedby={errors.first_name ? 'e-first_name' : undefined} />)}
        {field('patronymic', 'По батькові', <input value={f.patronymic} onChange={(e) => set('patronymic', e.target.value)} autoComplete="off" />)}
        {field('birth_date', 'Дата народження', (
          <BirthDateField id="f-birth_date" name="birth_date" value={f.birth_date}
            onChange={(iso, incomplete) => { set('birth_date', iso); setDateIncomplete(incomplete) }}
            minYear={new Date().getFullYear() - 30} maxYear={new Date().getFullYear() - 8} invalid={!!errors.birth_date} />
        ))}
        {field('grade', 'Клас *', (
          <select value={f.grade} onChange={(e) => set('grade', e.target.value)}>
            {[9, 10, 11].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        ))}
        {id && field('status', 'Статус', (
          <select value={f.status} onChange={(e) => set('status', e.target.value as StudentStatus)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ))}
        {!id && <p className="muted small">Новий учень спочатку нерозподілений (без кімнати); дані анкети він заповнить за персональним посиланням.</p>}
        {serverError && <p className="error" role="alert">{serverError}</p>}
        <div className="row">
          <button type="submit" disabled={saving}>{saving ? 'Зберігаємо…' : 'Зберегти'}</button>
          <Link className="btn secondary" to={id ? `/students/${id}` : '/students'}>Скасувати</Link>
        </div>
      </form>
    </section>
  )
}
