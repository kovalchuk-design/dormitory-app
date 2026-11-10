import type { ReactNode } from 'react'
import { MAX_LEN, SOCIAL_OPTIONS } from '../../supabase/functions/_shared/questionnaire.ts'
import type { ExtraErrors, ProfileExtra } from '../lib/newStudentProfile'

type Str = Exclude<keyof ProfileExtra, 'social_codes'>
export type ContactMode = 'parents' | 'guardian'

/**
 * Поля анкети учня для ручного введення вихователем (усі необов'язкові), у двох колонках:
 * ліва — про учня та інтереси, права — контакти (батьки або опікун), соціальний статус, здоров'я.
 */
export function StudentProfileFields({ column, value, errors, onChange, mode, onMode }: {
  column: 'left' | 'right'
  value: ProfileExtra
  errors: ExtraErrors
  onChange: (next: ProfileExtra) => void
  mode: ContactMode
  onMode: (m: ContactMode) => void
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
  const area = (k: Str, label: string, rows = 3): ReactNode => (
    <div className="field">
      <label htmlFor={`x-${k}`}>{label}</label>
      <textarea id={`x-${k}`} name={k} rows={rows} value={value[k]} maxLength={MAX_LEN[k]} aria-invalid={!!errors[k]}
        onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <span className="field-error" role="alert">{errors[k]}</span>}
    </div>
  )
  const phone = (k: Str, label: string) => input(k, label, { type: 'tel' })

  if (column === 'left') {
    return (
      <>
        <fieldset><legend>Про учня</legend>
          <div className="pair">{input('group_number', 'Номер групи')}{input('profession', 'Професія')}</div>
          <div className="pair">{input('class_teacher', 'Класний керівник')}{input('master', 'Майстер')}</div>
          {area('address', 'Адреса проживання', 2)}
          {phone('student_phone', 'Телефон учня')}
        </fieldset>
        <fieldset><legend>Інтереси</legend>
          <div className="pair">
            {area('school_activities', 'Чим займався(лась) у школі', 3)}
            {area('college_plans', 'Чим хоче займатися у коледжі', 3)}
          </div>
        </fieldset>
      </>
    )
  }
  return (
    <>
      <fieldset><legend>Кого вказати для зв'язку?</legend>
        <div className="seg" role="radiogroup" aria-label="Кого вказати для зв'язку">
          <label className={`seg-opt${mode === 'parents' ? ' on' : ''}`}>
            <input type="radio" name="contact_mode" value="parents" checked={mode === 'parents'} onChange={() => onMode('parents')} />
            Батьки
          </label>
          <label className={`seg-opt${mode === 'guardian' ? ' on' : ''}`}>
            <input type="radio" name="contact_mode" value="guardian" checked={mode === 'guardian'} onChange={() => onMode('guardian')} />
            Опікун
          </label>
        </div>
        {mode === 'parents' ? (
          <>
            <p className="muted small">Якщо когось одного немає — напишіть «немає» в його ПІБ. Немає обох — оберіть «Опікун».</p>
            <div className="pair">{input('mother_name', 'Мама — ПІБ')}{phone('mother_phone', 'Мама — телефон')}</div>
            <div className="pair">{input('father_name', 'Тато — ПІБ')}{phone('father_phone', 'Тато — телефон')}</div>
          </>
        ) : (
          <>
            <p className="muted small">Людина, яка виховує замість батьків. Дані мами й тата тоді не потрібні.</p>
            <div className="pair">{input('guardian_name', 'Опікун — ПІБ')}{input('guardian_relation', 'Ким доводиться')}</div>
            {phone('guardian_phone', 'Опікун — телефон')}
          </>
        )}
      </fieldset>
      <fieldset><legend>Соціальний статус</legend>
        <div className="social-grid">
          {SOCIAL_OPTIONS.map((o) => {
            const checked = value.social_codes.includes(o.code)
            return (
              <div key={o.code} className={`social-opt${checked && 'detail' in o ? ' wide' : ''}`}>
                <label className="check">
                  <input type="checkbox" name="social_codes" value={o.code} checked={checked} onChange={(e) => toggle(o.code, e.target.checked)} />
                  {o.label}
                </label>
                {checked && 'detail' in o && (
                  <div className="social-detail">
                    {input(o.detail, o.detail === 'social_children' ? 'Кількість неповнолітніх дітей' : 'Хто саме (ПІБ, ким доводиться)',
                      { type: o.detail === 'social_children' ? 'number' : 'text' })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>
      <fieldset><legend>Здоровʼя</legend>
        <p className="muted small">Ці дані бачать лише вихователі й адміністратор.</p>
        <div className="pair">{area('allergies', 'Алергії', 2)}{area('chronic_conditions', 'Хронічні хвороби', 2)}</div>
      </fieldset>
    </>
  )
}
