import { supabase } from '../../lib/supabase'
import type { Pupil, RoomInfo, Stay } from './logic'

export interface ApiError {
  message?: string
  code?: string
}

export interface PlacedPupil {
  roomId: string
  pupil: Pupil
}

export interface BoardData {
  rooms: RoomInfo[]
  placed: PlacedPupil[]
  unplaced: Pupil[]
  /** Остання кімната кожного нерозподіленого учня (studentId → номер), якщо він раніше жив у кімнаті. */
  lastRoom: Record<string, string>
}

type Result<T = void> = { data: T; error: null } | { data: null; error: ApiError }

interface StudentRow {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
  grade: number | null
}

const toPupil = (s: StudentRow): Pupil => ({
  id: s.id, lastName: s.last_name, firstName: s.first_name, patronymic: s.patronymic, grade: s.grade,
})

export async function fetchBoard(): Promise<Result<BoardData>> {
  const [occ, asg, pool] = await Promise.all([
    supabase.from('v_room_occupancy').select('room_id,floor,room,capacity,is_active,occupied'),
    supabase
      .from('room_assignments')
      .select('room_id, students!inner(id,last_name,first_name,patronymic,grade,status)')
      .is('to_date', null),
    supabase.from('v_unplaced_students').select('id,last_name,first_name,patronymic,grade'),
  ])
  const error = occ.error ?? asg.error ?? pool.error
  if (error) return { data: null, error }

  const rooms: RoomInfo[] = (occ.data ?? []).map((r) => ({
    id: r.room_id as string,
    floor: r.floor as number,
    number: r.room as string,
    capacity: r.capacity as number,
    isActive: Boolean(r.is_active),
    occupied: (r.occupied as number) ?? 0,
  }))
  const placed = ((asg.data ?? []) as unknown as { room_id: string; students: StudentRow }[]).map((a) => ({
    roomId: a.room_id,
    pupil: toPupil(a.students),
  }))
  const unplaced = ((pool.data ?? []) as unknown as StudentRow[]).map(toPupil)
  const lastRoom: Record<string, string> = {}
  if (unplaced.length > 0) {
    const last = await supabase
      .from('room_assignments')
      .select('student_id, created_at, rooms!room_assignments_room_id_fkey(number)')
      .in('student_id', unplaced.map((p) => p.id))
      .not('to_date', 'is', null)
      .order('created_at', { ascending: false })
    if (last.error) return { data: null, error: last.error }
    for (const r of (last.data ?? []) as unknown as { student_id: string; rooms: { number: string } | null }[]) {
      if (r.rooms && !(r.student_id in lastRoom)) lastRoom[r.student_id] = r.rooms.number
    }
  }
  return { data: { rooms, placed, unplaced, lastRoom }, error: null }
}

/** Поточна кімната учня на сервері (null — не заселений). Для виявлення застарілого стану. */
export async function fetchCurrentRoomId(studentId: string): Promise<Result<string | null>> {
  const { data, error } = await supabase
    .from('room_assignments').select('room_id').eq('student_id', studentId).is('to_date', null).maybeSingle()
  if (error) return { data: null, error }
  return { data: (data?.room_id as string | undefined) ?? null, error: null }
}

export async function moveStudent(studentId: string, roomId: string, reason: string | null): Promise<Result> {
  const { error } = await supabase.rpc('move_student', { p_student_id: studentId, p_room_id: roomId, p_reason: reason ?? undefined })
  return error ? { data: null, error } : { data: undefined, error: null }
}

export async function assignStudent(studentId: string, roomId: string, reason: string | null): Promise<Result> {
  const { error } = await supabase.rpc('assign_student', { p_student_id: studentId, p_room_id: roomId, p_reason: reason ?? undefined })
  return error ? { data: null, error } : { data: undefined, error: null }
}

export async function unassignStudent(studentId: string, reason: string | null): Promise<Result> {
  const { error } = await supabase.rpc('unassign_student', { p_student_id: studentId, p_reason: reason ?? undefined })
  return error ? { data: null, error } : { data: undefined, error: null }
}

export async function updateRoom(roomId: string, patch: { capacity?: number; is_active?: boolean }): Promise<Result> {
  const { error } = await supabase.from('rooms').update(patch).eq('id', roomId)
  return error ? { data: null, error } : { data: undefined, error: null }
}

export async function createRoom(input: { floor: number; number: string; capacity: number }): Promise<Result> {
  const { error } = await supabase.from('rooms').insert({ floor: input.floor, number: input.number.trim(), capacity: input.capacity })
  return error ? { data: null, error } : { data: undefined, error: null }
}

interface HistoryRow {
  id: string
  student_id: string
  room_id: string
  from_date: string
  to_date: string | null
  created_at: string
  reason: string | null
  end_reason: string | null
  from_room_id: string | null
  students: { last_name: string; first_name: string } | null
  rooms: { number: string } | null
  from_room: { number: string } | null
  mover: { full_name: string } | null
  ender: { full_name: string } | null
}

export interface HistoryStay extends Stay {
  movedByName: string | null
  endedByName: string | null
}

export async function fetchHistory(filter: { studentId: string } | { roomId: string }): Promise<Result<HistoryStay[]>> {
  let q = supabase
    .from('room_assignments')
    .select(
      'id,student_id,room_id,from_room_id,from_date,to_date,created_at,reason,end_reason,' +
        'students(last_name,first_name),rooms!room_assignments_room_id_fkey(number),' +
        'from_room:rooms!room_assignments_from_room_id_fkey(number),' +
        'mover:profiles!room_assignments_moved_by_fkey(full_name),ender:profiles!room_assignments_ended_by_fkey(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(500)
  q = 'studentId' in filter ? q.eq('student_id', filter.studentId) : q.eq('room_id', filter.roomId)
  const { data, error } = await q
  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as HistoryRow[]
  return {
    data: rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.students ? `${r.students.last_name} ${r.students.first_name}` : '—',
      roomId: r.room_id,
      roomNumber: r.rooms?.number ?? '—',
      fromDate: r.from_date,
      toDate: r.to_date,
      createdAt: r.created_at,
      fromRoomId: r.from_room_id,
      fromRoomNumber: r.from_room?.number ?? null,
      movedBy: null,
      reason: r.reason,
      endedBy: null,
      endReason: r.end_reason,
      movedByName: r.mover?.full_name ?? null,
      endedByName: r.ender?.full_name ?? null,
    })),
    error: null,
  }
}
