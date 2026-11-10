import { useState, type FormEvent } from 'react'
import { BirthDateField } from './BirthDateField'
import { Select } from './ui/Select'
import { StudentProfileFields, type ContactMode } from './StudentProfileFields'
import { errorMessage, isStudentStatus, STATUS_LABELS, type StudentStatus } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import {
  applyContactMode, extraFromProfile, hasMedicalData, profileChanged, toProfileRow, validateExtra, type ExtraErrors, type ProfileExtra,
} from '../lib/newStudentProfile'

type Student = Database['public']['Tables']['students']['Row']
type Profile = Database['public']['Tables']['student_profiles']['Row']
type Medical = Database['public']['Tables']['student_medical']['Row']

interface Base {
  last_name: string; first_name: string; patronymic: string; birth_date: string; grade: string; status: StudentStatus; notes: string
}

/**
 * Редагування всього на місці, прямо в картці учня (у шухляді чи на сторінці): основні дані, анкета, медичні відповіді, примітка.
 * Зміни анкети зберігаються як нова версія, яку одразу затверджує вихователь (стара стає «застарілою»); медичні — оновлюються.
 */
export function StudentInlineEdit({ student, current, medical, placed, onCancel, onSaved }: {
  student: Student; current: Profile | null; medical: Medical | null; placed: boolean; onCancel: () => void; onSaved: () => void
}) {
  const [f, setF] = useState<Base>({
    last_name: student.last_name, first_name: student.first_name, patronymic: student.patronymic ?? '', birth_date: student.birth_date ?? '',
    grade: String(student.grade), status: isStudentStatus(student.status) ? student.status : 'active', notes: student.notes ?? '',
  })
  const initialExtra = extraFromProfile(current, medical)
  const [extra, setExtra] = useState<ProfileExtra>(initialExtra)
  const [mode, setMode] = useState<ContactMode>(current?.guardian_name ? 'guardian' : 'parents')
  const [errors, setErrors] = useState<Partial<Record<keyof Base, string>>>({})
  const [xErrors, setXErrors] = useState<ExtraErrors>({})
  const [dateIncomplete, setDateIncomplete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const set = <K extends keyof Base>(k: K, v: Base[K]) => setF((p) => ({ ...p, [k]: v }))
  const legacySocial = !!current && !current.social_status_data && !!current.social_status?.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!f.last_name.trim()) errs.last_name = "Обов'язкове поле"
    if (!f.first_name.trim()) errs.first_name = "Обов'язкове поле"
    if (dateIncomplete) errs.birth_date = 'Оберіть день, місяць і рік (або приберіть усі три)'
    else if (f.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date)) errs.birth_date = 'Некоректна дата'
    setErrors(errs)
    const sendExtra = applyContactMode(extra, mode)
    const xe = validateExtra(sendExtra)
    setXErrors(xe)
    if (Object.keys(errs).length || Object.keys(xe).length) return

    const leaving = f.status !== 'active' && student.status === 'active' && placed
    if (leaving && !window.confirm('Учень буде виселений з кімнати та повернутий у пул нерозподілених (історія збережеться). Продовжити?')) return

    setSaving(true); setServerError(null)
    const up = await supabase.from('students').update({
      last_name: f.last_name.trim(), first_name: f.first_name.trim(), patronymic: f.patronymic.trim() || null,
      birth_date: f.birth_date || null, grade: Number(f.grade), status: f.status, notes: f.notes.trim() || null,
    }).eq('id', student.id)
    if (up.error) { setSaving(false); return setServerError(errorMessage(up.error)) }

    const problems: string[] = []
    if (leaving) {
      const r = await supabase.rpc('unassign_student', { p_student_id: student.id, p_reason: `Статус змінено на «${STATUS_LABELS[f.status]}»` })
      if (r.error) problems.push(`виселити з кімнати не вдалося: ${errorMessage(r.error)}`)
    }
    if (profileChanged(current, sendExtra, legacySocial)) {
      const row = toProfileRow(student.id, sendExtra)
      if (legacySocial && sendExtra.social_codes.length === 0) row.social_status = current?.social_status ?? null
      const ins = await supabase.from('student_profiles').insert(row).select('id').single()
      if (ins.error) problems.push(`анкету не збережено: ${errorMessage(ins.error)}`)
      else {
        const ap = await supabase.rpc('approve_student_profile', { p_profile_id: ins.data.id })
        if (ap.error) problems.push(`анкету збережено, але не затверджено: ${errorMessage(ap.error)}`)
      }
    }
    const medChanged = (sendExtra.allergies.trim() || '') !== (medical?.allergies ?? '').trim()
      || (sendExtra.chronic_conditions.trim() || '') !== (medical?.chronic_conditions ?? '').trim()
    if (medChanged && (hasMedicalData(sendExtra) || medical)) {
      const vals = { allergies: sendExtra.allergies.trim() || null, chronic_conditions: sendExtra.chronic_conditions.trim() || null }
      const r = medical
        ? await supabase.from('student_medical').update(vals).eq('id', medical.id)
        : await supabase.from('student_medical').insert({ student_id: student.id, ...vals })
      if (r.error) problems.push(`медичні дані не збережено: ${errorMessage(r.error)}`)
    }
    setSaving(false)
    if (problems.length) return setServerError(`Частину змін не збережено: ${problems.join('; ')}`)
    onSaved()
  }

  const err = (k: keyof Base) => errors[k] && <span className="field-error" id={`e-${k}`}>{errors[k]}</span>
  return (
    <form className="form edit-form inline-edit" onSubmit={(e) => void submit(e)} noValidate>
      <fieldset><legend>Основне</legend>
        <div className="pair">
          <label>Прізвище *<input value={f.last_name} onChange={(e) => set('last_name', e.target.value)} autoComplete="off" aria-invalid={!!errors.last_name} />{err('last_name')}</label>
          <label>Ім'я *<input value={f.first_name} onChange={(e) => set('first_name', e.target.value)} autoComplete="off" aria-invalid={!!errors.first_name} />{err('first_name')}</label>
        </div>
        <div className="pair">
          <label>По батькові<input value={f.patronymic} onChange={(e) => set('patronymic', e.target.value)} autoComplete="off" /></label>
          <label>Клас *
            <Select value={f.grade} onChange={(e) => set('grade', e.target.value)}>{[9, 10, 11].map((g) => <option key={g} value={g}>{g}</option>)}</Select>
          </label>
        </div>
        <label>Дата народження
          <BirthDateField id="f-birth_date" name="birth_date" value={f.birth_date}
            onChange={(iso, incomplete) => { set('birth_date', iso); setDateIncomplete(incomplete) }}
            minYear={new Date().getFullYear() - 30} maxYear={new Date().getFullYear() - 8} invalid={!!errors.birth_date} />
          {err('birth_date')}
        </label>
        <label>Статус
          <Select value={f.status} onChange={(e) => set('status', e.target.value as StudentStatus)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <label>Примітка
          <textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
      </fieldset>
      <StudentProfileFields column="left" value={extra} errors={xErrors} onChange={setExtra} mode={mode} onMode={setMode} />
      <StudentProfileFields column="right" value={extra} errors={xErrors} onChange={setExtra} mode={mode} onMode={setMode} />
      {legacySocial && extra.social_codes.length === 0 && (
        <p className="muted small">Соціальний статус «{current?.social_status}» внесено без переліку — він залишиться, поки ви не оберете пункти вище.</p>
      )}
      {serverError && <p className="error" role="alert">{serverError}</p>}
      <div className="row form-actions sticky-actions">
        <button type="submit" disabled={saving}>{saving ? 'Зберігаємо…' : 'Зберегти'}</button>
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>Скасувати</button>
      </div>
    </form>
  )
}
