import { supabase } from '../../lib/supabase'

export interface RosterRow {
  studentId: string
  roomId: string
  isDuty: boolean
}

export async function fetchRoster(night: string): Promise<{ rows: RosterRow[]; error: string | null }> {
  const { data, error } = await supabase.from('night_roster').select('student_id,room_id,is_duty').eq('night_date', night)
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []).map((r) => ({ studentId: r.student_id, roomId: r.room_id, isDuty: r.is_duty })), error: null }
}

/** Учень залишається на ніч (рядок є) або ні (рядка немає). */
export async function setPresent(night: string, studentId: string, roomId: string, on: boolean): Promise<string | null> {
  if (on) {
    const { error } = await supabase.from('night_roster').upsert(
      { night_date: night, student_id: studentId, room_id: roomId, is_duty: false },
      { onConflict: 'night_date,student_id', ignoreDuplicates: true },
    )
    return error ? error.message : null
  }
  const { error } = await supabase.from('night_roster').delete().eq('night_date', night).eq('student_id', studentId)
  return error ? error.message : null
}

export async function setDuty(night: string, studentId: string, duty: boolean): Promise<string | null> {
  const { error } = await supabase.from('night_roster').update({ is_duty: duty }).eq('night_date', night).eq('student_id', studentId)
  if (!error) return null
  return error.message.includes('DUTY_LIMIT') ? 'На поверсі вже двоє чергових' : error.message
}

/** Примусове скидання звіту: видаляє всі відмітки й чергових поточного вечора (старі вечори не чіпає). */
export async function clearRoster(night: string): Promise<string | null> {
  const { error } = await supabase.from('night_roster').delete().eq('night_date', night)
  return error ? error.message : null
}

/** Історію вечорів не ведемо (звіт передають на папері): старі вечори стираються, лишається лише поточний. Помилки (наприклад, немає прав) ігноруємо. */
export async function purgeOldNights(night: string): Promise<void> {
  await supabase.from('night_roster').delete().lt('night_date', night)
}
