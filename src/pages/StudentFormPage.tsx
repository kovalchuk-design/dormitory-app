import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import {
  EMPTY_QUESTIONNAIRE, MAX_LEN, SOCIAL_OPTIONS, validateQuestionnaire,
  type FieldErrors, type FieldKey, type QuestionnaireData, type TextKey,
} from '../../supabase/functions/_shared/questionnaire.ts'
import { BirthDateField } from '../components/BirthDateField'
import { applyContactMode, detectContactMode, remapContactErrors, type ContactMode } from '../lib/contactMode'
import { getQuestionnaire, submitQuestionnaire } from '../lib/publicApi'
import { InfoTip } from '../components/ui/InfoTip'
import { Icon } from '../components/ui/icons'
import { Select } from '../components/ui/Select'
import { buildSummary } from '../lib/formSummary'
import { OTHER, professionChoice } from '../lib/professions'
import { FormProgress } from '../components/ui/FormProgress'

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
  const [shared, setShared] = useState(false)
  const [mode, setMode] = useState<ContactMode>('parents')
  const [professions, setProfessions] = useState<string[]>([])
  const [profChoice, setProfChoice] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [validated, setValidated] = useState<QuestionnaireData | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const scrollTarget = useRef<string | null>(null)

  // Кнопка «Назад» у браузері на екрані перевірки повертає до форми (а не виходить зі сторінки)
  useEffect(() => {
    const onPop = () => setStep((cur) => (cur === 'review' ? 'form' : cur))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // після зміни кроку: або до потрібного розділу форми, або нагору
  useEffect(() => {
    const id = step === 'form' ? scrollTarget.current : null
    scrollTarget.current = null
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
    else window.scrollTo({ top: 0 })
  }, [step])

  useEffect(() => {
    let alive = true
    void getQuestionnaire(token).then((r) => {
      if (!alive) return
      if (r.kind === 'invalid') return setPhase({ name: 'invalid' })
      if (r.kind === 'error') return setPhase({ name: 'error', message: r.message })
      const p: NonNullable<typeof r.data.profile> = r.data.profile ?? {}
      const sd = r.data.profile?.social_status_data ?? null
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
        guardian_name: pick('guardian_name'), guardian_phone: pick('guardian_phone'), guardian_relation: pick('guardian_relation'),
        school_activities: pick('school_activities'), college_plans: pick('college_plans'),
        social_codes: Array.isArray(sd?.codes) ? sd.codes.filter((c: unknown): c is string => typeof c === 'string') : [],
        social_children: sd?.children_count != null ? String(sd.children_count) : '',
        social_ato: typeof sd?.ato === 'string' ? sd.ato : '', social_zsu: typeof sd?.zsu === 'string' ? sd.zsu : '',
      })
      setMode(detectContactMode(p))
      const list = r.data.professions ?? []
      setProfessions(list)
      setProfChoice(professionChoice(pick('profession'), list))
      setRoomLocked(!!r.data.room)
      setShared(r.data.mode === 'shared')
      setPhase({ name: 'form' })
    })
    return () => { alive = false }
  }, [token])

  const set = (k: FieldKey, v: string | boolean) => {
    setFormError(null)
    setValues((prev) => ({ ...prev, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }
  /** Вибір професії радіокнопкою: назва зі списку або «Інша» (тоді текстове поле). */
  const chooseProfession = (choice: string) => {
    setProfChoice(choice)
    setFormError(null)
    setValues((prev) => ({ ...prev, profession: choice === OTHER ? (professions.includes(prev.profession) ? '' : prev.profession) : choice }))
    setErrors((e) => ({ ...e, profession: undefined }))
  }
  const toggleSocial = (code: string, on: boolean) => {
    setValues((prev) => {
      let codes = on ? [...prev.social_codes, code] : prev.social_codes.filter((c) => c !== code)
      if (on && code === 'none') codes = ['none']
      else if (on) codes = codes.filter((c) => c !== 'none')
      return { ...prev, social_codes: codes }
    })
    setErrors((e) => ({ ...e, social_codes: undefined }))
  }
  const blur = (k: FieldKey) => {
    const r = validateQuestionnaire(applyContactMode(values, mode))
    setErrors((e) => ({ ...e, [k]: r.ok ? undefined : remapContactErrors(r.errors, mode)[k] }))
  }
  const switchMode = (next: ContactMode) => {
    setMode(next)
    setFormError(null)
    setErrors((e) => ({
      ...e, mother_name: undefined, mother_phone: undefined, father_name: undefined, father_phone: undefined,
      guardian_name: undefined, guardian_phone: undefined, guardian_relation: undefined,
    }))
  }

  function focusFirstError(errs: FieldErrors) {
    const first = (Object.keys(errs) as FieldKey[]).find((k) => errs[k])
    if (!first) return
    const sel = first === 'profession' && profChoice !== OTHER && professions.length > 0 ? '#f-profession_choice' : `[name="${first}"]`
    formRef.current?.querySelector<HTMLElement>(sel)?.focus()
  }

  /** Крок 1 → 2: перевірка полів (без згоди — вона на екрані перевірки) і перехід до підсумку. */
  function onNext(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const r = validateQuestionnaire({ ...applyContactMode(values, mode), consent: true })
    if (!r.ok) {
      const errs = remapContactErrors(r.errors, mode)
      setErrors(errs)
      setFormError('Перевір, будь ласка, виділені поля.')
      return focusFirstError(errs)
    }
    setValidated({ ...r.value, consent: false })
    setStep('review')
    window.history.pushState({ review: true }, '')
  }

  /** Повернення до форми: кнопка «Назад» (нагору) або «Змінити» біля розділу (до нього). */
  function backToForm(sectionId?: string) {
    scrollTarget.current = sectionId ?? null
    setFormError(null)
    if (window.history.state?.review) window.history.back()
    else setStep('form')
  }

  async function onSend() {
    if (!validated) return
    setFormError(null)
    if (!values.consent) {
      setErrors((e) => ({ ...e, consent: 'Потрібна згода на обробку персональних даних' }))
      return document.getElementById('f-consent')?.focus()
    }
    setSubmitting(true)
    const res = await submitQuestionnaire(token, { ...validated, consent: true })
    setSubmitting(false)
    switch (res.kind) {
      case 'ok': return setPhase({ name: 'done' })
      case 'invalid': return setPhase({ name: 'invalid' })
      case 'validation': {
        // сервер не прийняв поле, яке клієнт пропустив: повертаємо до форми з помилками
        setErrors(res.fields); setFormError('Перевір, будь ласка, виділені поля.')
        scrollTarget.current = null
        return backToForm()
      }
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

  const text = (k: FieldKey, label: string, opts: { required?: boolean; type?: string; auto?: string; hint?: string; readOnly?: boolean; inputMode?: 'tel' | 'numeric' } = {}) => (
    <Field name={k} label={label} required={opts.required} hint={opts.hint} error={errors[k]}>
      <input
        id={`f-${k}`} name={k} type={opts.type ?? 'text'} value={values[k] as string}
        autoComplete={opts.auto ?? 'off'} inputMode={opts.inputMode} readOnly={opts.readOnly} enterKeyHint="next"
        maxLength={MAX_LEN[k as TextKey]}
        aria-invalid={!!errors[k]} aria-describedby={describedBy(k, !!opts.hint, !!errors[k])}
        onChange={(e) => set(k, e.target.value)} onBlur={() => blur(k)}
      />
    </Field>
  )
  const area = (k: FieldKey, label: string, hint?: string) => (
    <Field name={k} label={label} hint={hint} error={errors[k]}>
      <textarea
        id={`f-${k}`} name={k} rows={3} value={values[k] as string}
        maxLength={MAX_LEN[k as TextKey]}
        aria-invalid={!!errors[k]} aria-describedby={describedBy(k, !!hint, !!errors[k])}
        onChange={(e) => set(k, e.target.value)} onBlur={() => blur(k)}
      />
    </Field>
  )
  const phone = (k: FieldKey, label: string, required = false) =>
    text(k, label, { required, type: 'tel', auto: 'tel', inputMode: 'tel', hint: 'Наприклад: +380671234567' })

  const v = values as unknown as Record<string, unknown>
  const required = [
    'full_name', 'birth_date', 'group_number', 'profession', 'class_teacher', 'master', 'address', 'student_phone',
    'school_activities', 'college_plans',
    ...(mode === 'parents' ? ['mother_name', 'father_name'] : ['guardian_name', 'guardian_relation', 'guardian_phone']),
  ]
  const done = required.filter((k) => String(v[k] ?? '').trim() !== '').length
    + (values.social_codes.length > 0 ? 1 : 0)
  const total = required.length + 1

  if (step === 'review' && validated) {
    const sections = buildSummary(validated, mode)
    return (
      <Shell>
        <h1>Перевір свою анкету</h1>
        <p className="muted">Подивись, чи все правильно. Якщо помітив помилку, натисни олівець біля розділу й виправ. Далі натисни «Надіслати».</p>
        {sections.map((sec) => (
          <section key={sec.id} className="review-sec" aria-labelledby={`rv-${sec.id}`}>
            <div className="review-head">
              <h2 id={`rv-${sec.id}`}>{sec.title}</h2>
              <button type="button" className="iconbtn" aria-label={`Змінити розділ «${sec.title}»`} title="Змінити" onClick={() => backToForm(sec.id)}>
                <Icon name="edit" />
              </button>
            </div>
            {sec.note && <p className="muted small">{sec.note}</p>}
            <dl className="kv">
              {sec.items.map((it) => (
                <div key={it.key} className={it.emphasis ? 'kv-key' : undefined}>
                  <dt>{it.label}</dt>
                  <dd className={it.empty ? 'muted' : undefined}>{it.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <div className="consent">
          <label className="check">
            <input id="f-consent" type="checkbox" name="consent" checked={values.consent} aria-invalid={!!errors.consent}
              aria-describedby="consent-text" onChange={(e) => set('consent', e.target.checked)} />
            <span id="consent-text">{CONSENT_TEXT} *</span>
          </label>
          {errors.consent && <p className="field-error" role="alert">{errors.consent}</p>}
        </div>
        {formError && <p className="error" role="alert">{formError}</p>}
        <div className="row actions review-actions">
          <button type="button" className="secondary" onClick={() => backToForm()} disabled={submitting}>Назад до анкети</button>
          <button type="button" onClick={() => void onSend()} disabled={submitting}>{submitting ? 'Надсилаємо…' : 'Надіслати анкету'}</button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1>Анкета мешканця гуртожитку</h1>
      <p className="muted">Привіт! Заповни, будь ласка, анкету — це займе кілька хвилин. Поля з * обовʼязкові. Вхід не потрібен.</p>
      <FormProgress done={done} total={total} />
      <form ref={formRef} onSubmit={onNext} noValidate className="form">
        <fieldset id="sec-about"><legend>Про тебе</legend>
          {text('full_name', 'ПІБ', { required: true, auto: 'name', hint: shared ? 'Пиши так, як у документах: прізвище, імʼя, по батькові — за цим ми знайдемо тебе у списку' : 'Прізвище, імʼя, по батькові' })}
          <Field name="birth_date" label="Дата народження" required error={errors.birth_date}
            hint={shared ? 'Потрібна, щоб правильно знайти тебе у списку' : undefined}>
            <BirthDateField id="f-birth_date" name="birth_date" value={values.birth_date} onChange={(iso) => set('birth_date', iso)}
              minYear={new Date().getFullYear() - 25} maxYear={new Date().getFullYear() - 12} invalid={!!errors.birth_date}
              describedBy={describedBy('birth_date', shared, !!errors.birth_date)} />
          </Field>
          {text('room', 'Номер кімнати', { readOnly: roomLocked, hint: roomLocked ? 'Це тільки для інформації — змінює вихователь' : 'Якщо знаєш — вкажи (необовʼязково)' })}
          {text('group_number', 'Номер групи', { required: true })}
          {professions.length === 0 ? text('profession', 'Професія', { required: true }) : (
            <>
              <Field name="profession_choice" label="Професія" required error={profChoice !== OTHER ? errors.profession : undefined}>
                <Select id="f-profession_choice" name="profession_choice" aria-label="Професія" value={profChoice}
                  onChange={(e) => chooseProfession(e.target.value)} aria-invalid={!!errors.profession && profChoice !== OTHER}
                  aria-describedby={errors.profession && profChoice !== OTHER ? 'e-profession_choice' : undefined}>
                  <option value="">Оберіть зі списку</option>
                  {professions.map((name) => <option key={name} value={name}>{name}</option>)}
                  <option value={OTHER}>Інша (написати свою)</option>
                </Select>
              </Field>
              {profChoice && profChoice !== OTHER && <p className="prof-picked small" aria-live="polite">{profChoice}</p>}
              {profChoice === OTHER && text('profession', 'Напиши свою професію', { required: true, hint: 'Повна назва, як у документах' })}
            </>
          )}
          {text('class_teacher', 'Класний керівник', { required: true })}
          {text('master', 'Майстер', { required: true })}
          {area('address', 'Адреса проживання *')}
          {phone('student_phone', 'Твій мобільний телефон', true)}
        </fieldset>
        <fieldset id="sec-contacts">
          <legend>
            Кого вказати для зв'язку?
            <InfoTip id="contact-help" label="Як обрати, кого вказати">
              Обери <strong>одне</strong>: або мама й тато, або опікун — людина, яка тебе виховує замість батьків (бабуся, дідусь, тітка, дядько, опікун…).
              Другий варіант заповнювати не треба.
            </InfoTip>
          </legend>
          <div className="seg" role="radiogroup" aria-label="Кого вказати для зв'язку" aria-describedby="contact-help">
            <label className={`seg-opt${mode === 'parents' ? ' on' : ''}`}>
              <input type="radio" name="contact_mode" value="parents" checked={mode === 'parents'} onChange={() => switchMode('parents')} />
              Батьки
            </label>
            <label className={`seg-opt${mode === 'guardian' ? ' on' : ''}`}>
              <input type="radio" name="contact_mode" value="guardian" checked={mode === 'guardian'} onChange={() => switchMode('guardian')} />
              Опікун
            </label>
          </div>
          {mode === 'parents' ? (
            <>
              <p className="muted small">Якщо когось одного немає — напиши «немає» в його ПІБ, а телефон залиш порожнім. Немає обох — обери «Опікун».</p>
              {text('mother_name', 'Мама — ПІБ', { required: true, hint: 'Або «немає»' })}
              {phone('mother_phone', 'Мама — телефон')}
              {text('father_name', 'Тато — ПІБ', { required: true, hint: 'Або «немає»' })}
              {phone('father_phone', 'Тато — телефон')}
            </>
          ) : (
            <>
              <p className="muted small">Дані мами й тата тоді не потрібні.</p>
              {text('guardian_name', 'Опікун — ПІБ', { required: true })}
              {text('guardian_relation', 'Ким доводиться', { required: true, hint: 'Наприклад: бабуся, дядько, опікун' })}
              {phone('guardian_phone', 'Опікун — телефон', true)}
            </>
          )}
        </fieldset>
        <fieldset id="sec-interests"><legend>Інтереси</legend>
          {area('school_activities', 'Чим займався(лась) у школі *')}
          {area('college_plans', 'Чим хочеш займатися у коледжі *')}
        </fieldset>
        <fieldset id="sec-social" aria-describedby="social-hint" aria-invalid={!!errors.social_codes}>
          <legend>
            Соціальний статус *
            <InfoTip id="social-hint" label="Як заповнити соціальний статус">Познач усе, що підходить. Якщо нічого — обери «Жодного з переліку».</InfoTip>
          </legend>
          {SOCIAL_OPTIONS.map((o) => {
            const checked = values.social_codes.includes(o.code)
            return (
              <div key={o.code} className="social-opt">
                <label className="check">
                  <input type="checkbox" name="social_codes" value={o.code} checked={checked}
                    onChange={(e) => toggleSocial(o.code, e.target.checked)} />
                  {o.label}
                </label>
                {checked && 'detail' in o && (
                  <div className="social-detail">
                    {text(o.detail, o.detail === 'social_children' ? 'Кількість неповнолітніх дітей у сімʼї' : 'Хто саме (ПІБ, ким доводиться)',
                      { required: true, type: o.detail === 'social_children' ? 'number' : 'text', inputMode: o.detail === 'social_children' ? 'numeric' : undefined })}
                  </div>
                )}
              </div>
            )
          })}
          {errors.social_codes && <p className="field-error" id="e-social_codes" role="alert">{errors.social_codes}</p>}
        </fieldset>
        <fieldset id="sec-health"><legend>Здоровʼя (необовʼязково)</legend>
          <p className="muted small">Якщо не знаєш — залиш порожнім, вихователь уточнить пізніше. Ці дані бачать лише вихователі й адміністратор.</p>
          {area('allergies', 'Алергії', 'Наприклад: пилок, горіхи, ліки')}
          {area('chronic_conditions', 'Хронічні хвороби', 'Наприклад: астма, діабет')}
        </fieldset>
        {formError && <p className="error" role="alert">{formError}</p>}
        <button type="submit">Далі: перевірити</button>
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
