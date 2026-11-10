import { isNone, type QuestionnaireData } from '../../supabase/functions/_shared/questionnaire.ts'
import type { ContactMode } from './contactMode'

export interface SummaryItem {
  key: string
  label: string
  value: string
  /** поле, за яким учня шукають у базі, — виділяємо */
  emphasis?: boolean
  /** нічого не вказано (необов'язкове поле) */
  empty?: boolean
}

export interface SummarySection {
  /** збігається з id блока форми — туди повертає «Змінити» */
  id: string
  title: string
  note?: string
  items: SummaryItem[]
}

const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']

/** 2008-07-31 → «31 липня 2008» (без зсувів часових поясів). */
export function formatLongDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${Number(m[3])} ${MONTHS_GEN[Number(m[2]) - 1]} ${m[1]}` : iso
}

/** +380985504113 → «+380 98 550 41 13»; невідомий формат лишаємо як є. */
export function formatPhoneDisplay(phone: string): string {
  const m = /^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  return m ? `+380 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone
}

const NOT_GIVEN = 'не вказано'

const item = (key: string, label: string, raw: string, extra: Partial<SummaryItem> = {}): SummaryItem =>
  raw ? { key, label, value: raw, ...extra } : { key, label, value: NOT_GIVEN, empty: true, ...extra }

function person(name: string, phone: string, relation = ''): string {
  if (isNone(name)) return 'немає'
  return [relation ? `${name} (${relation})` : name, phone ? formatPhoneDisplay(phone) : ''].filter(Boolean).join(', ')
}

/** Підсумок для екрана перевірки; приймає вже перевірені (нормалізовані) значення. */
export function buildSummary(v: QuestionnaireData, mode: ContactMode): SummarySection[] {
  const contacts: SummaryItem[] =
    mode === 'guardian'
      ? [item('guardian', 'Опікун', person(v.guardian_name, v.guardian_phone, v.guardian_relation))]
      : [item('mother', 'Мама', person(v.mother_name, v.mother_phone)), item('father', 'Тато', person(v.father_name, v.father_phone))]
  return [
    {
      id: 'sec-about', title: 'Про тебе',
      note: 'ПІБ і дата народження — за ними ми знаходимо тебе у списку. Перевір їх особливо уважно.',
      items: [
        item('full_name', 'ПІБ', v.full_name, { emphasis: true }),
        item('birth_date', 'Дата народження', v.birth_date ? formatLongDate(v.birth_date) : '', { emphasis: true }),
        ...(v.room ? [item('room', 'Номер кімнати', v.room)] : []),
        item('group_number', 'Номер групи', v.group_number),
        item('profession', 'Професія', v.profession),
        item('class_teacher', 'Класний керівник', v.class_teacher),
        item('master', 'Майстер', v.master),
        item('address', 'Адреса проживання', v.address),
        item('student_phone', 'Твій телефон', v.student_phone ? formatPhoneDisplay(v.student_phone) : ''),
      ],
    },
    { id: 'sec-contacts', title: mode === 'guardian' ? 'Опікун' : 'Батьки', items: contacts },
    {
      id: 'sec-interests', title: 'Інтереси',
      items: [item('school_activities', 'Чим займався(лась) у школі', v.school_activities), item('college_plans', 'Чим хочеш займатися у коледжі', v.college_plans)],
    },
    { id: 'sec-social', title: 'Соціальний статус', items: [item('social_status', 'Обрано', v.social_status)] },
    {
      id: 'sec-health', title: 'Здоровʼя',
      note: 'Необовʼязково: якщо не знаєш — залиш порожнім, вихователь уточнить пізніше.',
      items: [item('allergies', 'Алергії', v.allergies), item('chronic_conditions', 'Хронічні хвороби', v.chronic_conditions)],
    },
  ]
}
