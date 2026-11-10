import type { ReactNode } from 'react'
import { MAX_LEN, SOCIAL_OPTIONS } from '../../supabase/functions/_shared/questionnaire.ts'
import type { ExtraErrors, ProfileExtra } from '../lib/newStudentProfile'

type Str = Exclude<keyof ProfileExtra, 'social_codes'>

/** Усі поля анкети учня для ручного введення вихователем (необов'язкові): те саме, що в анкеті для учнів. */
export function StudentProfileFields({ value, errors, onChange }: {
  value: ProfileExtra
  errors: ExtraErrors
  onChange: (next: ProfileExtra) => void
}) {
  const set = (k: Str, v: string) => onChange({ ...value, [k]: v })
  const toggle = (code: string, on: boolean) => {
    let codes = on ? [...value.social_codes, code] : value.social_codes.filter((c) => c !== code)
    if (on && code === 'none') codes = ['none']
    else if (on) codes = codes.filter((c) => c !== 'none')
    onChange({ ...value, social_codes: codes })
  }
  const input = (k: Str, label: string, opts: { type?: string; hint?: string } = {}): ReactNode => (
    <div className="field">
      <label htmlFor={`x-${k}`}>{label}</label>
      <input id={`x-${k}`} name={k} type={opts.type ?? 'text'} value={value[k]} maxLength={MAX_LEN[k]} autoComplete="off"
        inputMode={opts.type === 'tel' ? 'tel' : undefined} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `xe-${k}` : undefined}
        onChange={(e) => set(k, e.target.value)} />
      {opts.hint && !errors[k] && <span className="hint">{opts.hint}</span>}
      {errors[k] && <span className="field-error" id={`xe-${k}`} role="alert">{errors[k]}</span>}
    </div>
  )
  const area = (k: Str, label: string): ReactNode => (
    <div className="field">
      <label htmlFor={`x-${k}`}>{label}</label>
      <textarea id={`x-${k}`} name={k} rows={3} value={value[k]} maxLength={MAX_LEN[k]} aria-invalid={!!errors[k]}
        onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <span className="field-error" role="alert">{errors[k]}</span>}
    </div>
  )
  const phone = (k: Str, label: string) => input(k, label, { type: 'tel', hint: 'Наприклад: +380671234567' })

  return (
    <>
      <p className="muted small">Заповніть те, що відомо, — решту можна додати пізніше. Усі ці поля необов'язкові.</p>
      <fieldset><legend>Про учня</legend>
        {input('group_number', 'Номер групи')}
        {input('profession', 'Професія')}
        {input('class_teacher', 'Класний керівник')}
        {input('master', 'Майстер')}
        {area('address', 'Адреса проживання')}
        {phone('student_phone', 'Телефон учня')}
      </fieldset>
      <fieldset><legend>Батьки</legend>
        {input('mother_name', 'Мама — ПІБ', { hint: 'Якщо немає — напишіть «немає»' })}
        {phone('mother_phone', 'Мама — телефон')}
        {input('father_name', 'Тато — ПІБ', { hint: 'Якщо немає — напишіть «немає»' })}
        {phone('father_phone', 'Тато — телефон')}
      </fieldset>
      <fieldset><legend>Опікун</legend>
        {input('guardian_name', 'Опікун — ПІБ')}
        {input('guardian_relation', 'Ким доводиться', { hint: 'Наприклад: бабуся, дядько, опікун' })}
        {phone('guardian_phone', 'Опікун — телефон')}
      </fieldset>
      <fieldset><legend>Інтереси</legend>
        {area('school_activities', 'Чим займався(лась) у школі')}
        {area('college_plans', 'Чим хоче займатися у коледжі')}
      </fieldset>
      <fieldset><legend>Соціальний статус</legend>
        {SOCIAL_OPTIONS.map((o) => {
          const checked = value.social_codes.includes(o.code)
          return (
            <div key={o.code} className="social-opt">
              <label className="check">
                <input type="checkbox" name="social_codes" value={o.code} checked={checked} onChange={(e) => toggle(o.code, e.target.checked)} />
                {o.label}
              </label>
              {checked && 'detail' in o && (
                <div className="social-detail">
                  {input(o.detail, o.detail === 'social_children' ? 'Кількість неповнолітніх дітей у сімʼї' : 'Хто саме (ПІБ, ким доводиться)',
                    { type: o.detail === 'social_children' ? 'number' : 'text' })}
                </div>
              )}
            </div>
          )
        })}
      </fieldset>
      <fieldset><legend>Здоровʼя</legend>
        <p className="muted small">Ці дані бачать лише вихователі й адміністратор.</p>
        {area('allergies', 'Алергії')}
        {area('chronic_conditions', 'Хронічні хвороби')}
      </fieldset>
    </>
  )
}
