import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import {
  EMPTY_QUESTIONNAIRE, MAX_LEN, validateQuestionnaire,
  type FieldErrors, type FieldKey, type QuestionnaireData,
} from '../../supabase/functions/_shared/questionnaire.ts'
import { getQuestionnaire, submitQuestionnaire } from '../lib/publicApi'

type Phase =
  | { name: 'loading' }
  | { name: 'invalid' }
  | { name: 'error'; message: string }
  | { name: 'form' }
  | { name: 'done' }

const CONSENT_TEXT =
  'Я погоджуюсь на обробку моїх персональних даних (зокрема даних про здоровʼя), які я вказую в анкеті. ' +
  'Їх використовують лише працівники гуртожитку — для проживання, безпеки та звʼязку з батьками чи опікунами. ' +
  'Якщо мені ще немає 18 років, цю згоду також надають батьки або опікуни.'

/** Публічна анкета за персональним посиланням (без входу). Недійсне/прострочене/використане посилання виглядає однаково. */
export function StudentFormPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [values, setValues] = useState<QuestionnaireData>(EMPTY_QUESTIONNAIRE)
  const [roomLocked, setRoomLocked] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let alive = true
    void getQuestionnaire(token).then((r) => {
      if (!alive) return
      if (r.kind === 'invalid') return setPhase({ name: 'invalid' })
      if (r.kind === 'error') return setPhase({ name: 'error', message: r.message })
      const p = r.data.profile ?? {}
      const pick = (k: FieldKey) => (typeof p[k] === 'string' ? (p[k] as string) : '')
      setValues({
        ...EMPTY_QUESTIONNAIRE,
        full_name: r.data.full_name ?? '',
        birth_date: r.data.birth_date ?? '',
        room: r.data.room ?? '',
        group_number: pick('group_number'), profession: pick('profession'), class_teacher: pick('class_teacher'),
        master: pick('master'), address: pick('address'), student_phone: pick('student_phone'),
        mother_name: pick('mother_name'), mother_phone: pick('mother_phone'),
        father_name: pick('father_name'), father_phone: pick('father_phone'),
        guardian_name: pick('guardian_name'), guardian_phone: pick('guardian_phone'),
        school_activities: pick('school_activities'), college_plans: pick('college_plans'), social_status: pick('social_status'),
      })
      setRoomLocked(!!r.data.room)
      setPhase({ name: 'form' })
    })
    return () => { alive = false }
  }, [token])

  const set = (k: FieldKey, v: string | boolean) => {
    setValues((prev) => ({ ...prev, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const blur = (k: FieldKey) => {
    const r = validateQuestionnaire(values)
    setErrors((e) => ({ ...e, [k]: r.ok ? undefined : r.errors[k] }))
  }

  function focusFirstError(errs: FieldErrors) {
    const first = (Object.keys(errs) as FieldKey[]).find((k) => errs[k])
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const r = validateQuestionnaire(values)
    if (!r.ok) {
      setErrors(r.errors)
      setFormError('Перевір, будь ласка, виділені поля.')
      return focusFirstError(r.errors)
    }
    setSubmitting(true)
    const res = await submitQuestionnaire(token, r.value)
    setSubmitting(false)
    switch (res.kind) {
      case 'ok': return setPhase({ name: 'done' })
      case 'invalid': return setPhase({ name: 'invalid' })
      case 'validation': setErrors(res.fields); setFormError('Перевір, будь ласка, виділені поля.'); return focusFirstError(res.fields)
      case 'rate_limited': return setFormError('Забагато спроб. Зачекай кілька хвилин і спробуй ще раз.')
      default: return setFormError('Не вдалося надіслати. Перевір інтернет і спробуй ще раз — твої відповіді збережені на цій сторінці.')
    }
  }

  if (phase.name === 'loading') return <Shell><p role="status">Завантаження…</p></Shell>
  if (phase.name === 'invalid')
    return (
      <Shell>
        <h1>Посилання не працює</h1>
        <p>Це посилання недійсне, прострочене або вже використане. Попроси вихователя дати нове.</p>
      </Shell>
    )
  if (phase.name === 'error')
    return (
      <Shell>
        <h1>Щось пішло не так</h1>
        <p>{phase.message}</p>
        <button type="button" onClick={() => window.location.reload()}>Спробувати ще раз</button>
      </Shell>
    )
  if (phase.name === 'done')
    return (
      <Shell>
        <h1>Дякуємо! 🎉</h1>
        <p>Твою анкету надіслано. Вихователь перевірить її і підтвердить. Це посилання вже використано — закривай сторінку.</p>
      </Shell>
    )

  const text = (k: FieldKey, label: string, opts: { required?: boolean; type?: string; auto?: string; hint?: string; readOnly?: boolean; inputMode?: 'tel' } = {}) => (
    <Field name={k} label={label} required={opts.required} hint={opts.hint} error={errors[k]}>
      <input
        id={`f-${k}`} name={k} type={opts.type ?? 'text'} value={values[k] as string}
        autoComplete={opts.auto ?? 'off'} inputMode={opts.inputMode} readOnly={opts.readOnly}
        maxLength={k === 'consent' ? undefined : MAX_LEN[k as Exclude<FieldKey, 'consent'>]}
        aria-invalid={!!errors[k]} aria-describedby={describedBy(k, !!opts.hint, !!errors[k])}
        onChange={(e) => set(k, e.target.value)} onBlur={() => blur(k)}
      />
    </Field>
  )
  const area = (k: FieldKey, label: string, hint?: string) => (
    <Field name={k} label={label} hint={hint} error={errors[k]}>
      <textarea
        id={`f-${k}`} name={k} rows={3} value={values[k] as string}
        maxLength={MAX_LEN[k as Exclude<FieldKey, 'consent'>]}
        aria-invalid={!!errors[k]} aria-describedby={describedBy(k, !!hint, !!errors[k])}
        onChange={(e) => set(k, e.target.value)} onBlur={() => blur(k)}
      />
    </Field>
  )
  const phone = (k: FieldKey, label: string, required = false) =>
    text(k, label, { required, type: 'tel', auto: 'tel', inputMode: 'tel', hint: 'Наприклад: +380671234567' })

  return (
    <Shell>
      <h1>Анкета мешканця гуртожитку</h1>
      <p className="muted">Привіт! Заповни, будь ласка, анкету — це займе кілька хвилин. Поля з * обовʼязкові. Вхід не потрібен.</p>
      <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="form">
        <fieldset><legend>Про тебе</legend>
          {text('full_name', 'ПІБ', { required: true, auto: 'name', hint: 'Прізвище, імʼя, по батькові' })}
          {text('birth_date', 'Дата народження', { required: true, type: 'date', auto: 'bday' })}
          {text('room', 'Номер кімнати', { readOnly: roomLocked, hint: roomLocked ? 'Це тільки для інформації — змінює вихователь' : 'Якщо знаєш — вкажи (необовʼязково)' })}
          {text('group_number', 'Номер групи', { required: true })}
          {text('profession', 'Професія', { required: true })}
          {text('class_teacher', 'Класний керівник', { required: true })}
          {text('master', 'Майстер', { required: true })}
          {area('address', 'Адреса проживання *')}
          {phone('student_phone', 'Твій мобільний телефон', true)}
        </fieldset>
        <fieldset><legend>Батьки та опікун</legend>
          <p className="muted small">Вкажи принаймні одного з батьків або опікуна — зі телефоном.</p>
          {text('mother_name', 'Мама — ПІБ')}
          {phone('mother_phone', 'Мама — телефон')}
          {text('father_name', 'Тато — ПІБ')}
          {phone('father_phone', 'Тато — телефон')}
          {text('guardian_name', 'Опікун — ПІБ (якщо є)')}
          {phone('guardian_phone', 'Опікун — телефон')}
        </fieldset>
        <fieldset><legend>Інтереси</legend>
          {area('school_activities', 'Чим займався(лась) у школі')}
          {area('college_plans', 'Чим хочеш займатися у коледжі')}
          {area('social_status', 'Соціальний статус', 'Наприклад: повна сімʼя, багатодітна, ВПО… (необовʼязково)')}
        </fieldset>
        <fieldset><legend>Здоровʼя</legend>
          <p className="muted small">Ці дані бачать лише вихователі й адміністратор.</p>
          {area('allergies', 'Алергії', 'Якщо немає — залиш порожнім')}
          {area('chronic_conditions', 'Хронічні хвороби', 'Якщо немає — залиш порожнім')}
        </fieldset>
        <div className="consent">
          <label className="check">
            <input type="checkbox" name="consent" checked={values.consent} aria-invalid={!!errors.consent}
              aria-describedby="consent-text" onChange={(e) => set('consent', e.target.checked)} />
            <span id="consent-text">{CONSENT_TEXT} *</span>
          </label>
          {errors.consent && <p className="field-error" role="alert">{errors.consent}</p>}
        </div>
        {formError && <p className="error" role="alert">{formError}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Надсилаємо…' : 'Надіслати анкету'}</button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="public-page"><main className="public-card">{children}</main></div>
}

const describedBy = (k: string, hint: boolean, err: boolean) =>
  [hint ? `h-${k}` : '', err ? `e-${k}` : ''].filter(Boolean).join(' ') || undefined

function Field({ name, label, required, hint, error, children }: {
  name: string; label: string; required?: boolean; hint?: string; error?: string; children: ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}{required && ' *'}</label>
      {children}
      {hint && <span className="hint" id={`h-${name}`}>{hint}</span>}
      {error && <span className="field-error" id={`e-${name}`} role="alert">{error}</span>}
    </div>
  )
}
