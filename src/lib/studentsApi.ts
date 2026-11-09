import { supabase } from './supabase'
import { isStudentStatus } from './format'
import type { StudentRow } from './studentsList'

type RoomRef = { number: string; floor: number } | null

/** Учні + поточна кімната + телефони з останньої затвердженої анкети (три запити, зʼєднання на клієнті). */
export async function fetchStudentRows(): Promise<StudentRow[]> {
  const [st, asg, prof] = await Promise.all([
    supabase.from('students').select('id,last_name,first_name,patronymic,birth_date,grade,status').order('last_name').limit(2000),
    supabase.from('room_assignments').select('student_id, rooms!room_assignments_room_id_fkey(number,floor)').is('to_date', null).limit(2000),
    supabase
      .from('student_profiles')
      .select('student_id,student_phone,mother_phone,father_phone,guardian_phone')
      .eq('status', 'approved')
      .limit(2000),
  ])
  if (st.error) throw st.error
  if (asg.error) throw asg.error
  if (prof.error) throw prof.error

  const rooms = new Map<string, RoomRef>(asg.data.map((a) => [a.student_id, a.rooms as unknown as RoomRef]))
  const profiles = new Map(prof.data.map((p) => [p.student_id, p]))
  return st.data.map((s) => {
    const room = rooms.get(s.id) ?? null
    const p = profiles.get(s.id)
    return {
      id: s.id, last_name: s.last_name, first_name: s.first_name, patronymic: s.patronymic,
      birth_date: s.birth_date, grade: s.grade,
      status: isStudentStatus(s.status) ? s.status : 'active',
      room: room?.number ?? null, floor: room?.floor ?? null,
      student_phone: p?.student_phone ?? null, mother_phone: p?.mother_phone ?? null,
      father_phone: p?.father_phone ?? null, guardian_phone: p?.guardian_phone ?? null,
    }
  })
}
