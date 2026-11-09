import { isNone, NONE, type FieldErrors, type QuestionnaireData } from '../../supabase/functions/_shared/questionnaire.ts'

/** Кого учень вказує для зв'язку: батьків чи опікуна (одне з двох — форма не роздувається). */
export type ContactMode = 'parents' | 'guardian'

/**
 * Приводить значення форми до того, що розуміє сервер:
 *  - «Опікун»: батьки = «немає», дані опікуна обов'язкові (правило сервера: якщо батьків немає — потрібен опікун);
 *  - «Батьки»: дані опікуна очищаються.
 */
export function applyContactMode(v: QuestionnaireData, mode: ContactMode): QuestionnaireData {
  return mode === 'guardian'
    ? { ...v, mother_name: NONE, mother_phone: '', father_name: NONE, father_phone: '' }
    : { ...v, guardian_name: '', guardian_phone: '', guardian_relation: '' }
}

/** Режим для попередньо заповненої анкети: опікун, якщо вказано його, а обидва батьки — «немає». */
export function detectContactMode(p: { mother_name?: string | null; father_name?: string | null; guardian_name?: string | null }): ContactMode {
  return p.guardian_name && isNone(p.mother_name ?? '') && isNone(p.father_name ?? '') ? 'guardian' : 'parents'
}

/** У режимі «Батьки» поля опікуна приховані: помилку про опікуна показуємо біля батьків з підказкою про перемикач. */
export function remapContactErrors(errors: FieldErrors, mode: ContactMode): FieldErrors {
  if (mode === 'guardian' && errors.guardian_name?.startsWith('Якщо батьків')) return { ...errors, guardian_name: "Обов'язкове поле" }
  if (mode !== 'parents' || !errors.guardian_name) return errors
  const { guardian_name: _g, guardian_phone: _p, guardian_relation: _r, ...rest } = errors
  void _g; void _p; void _r
  return { ...rest, mother_name: rest.mother_name ?? 'Якщо немає обох батьків — переключіть вище на «Опікун» і вкажіть його' }
}
