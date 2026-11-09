// Чиста логіка сторінки «Кімнати»: правила місткості, перевірка скидання, групування, повідомлення про помилки.

export const FLOORS = [2, 3, 4, 5] as const
export const MIN_CAPACITY = 4
export const MAX_CAPACITY = 6
export const DEFAULT_CAPACITY = 6

export interface RoomInfo {
  id: string
  floor: number
  number: string
  capacity: number
  isActive: boolean
  occupied: number
}

export interface Pupil {
  id: string
  lastName: string
  firstName: string
  patronymic: string | null
  grade: number
}

/** Місце призначення перетягування: кімната або пул «Нерозподілені». */
export type DropTarget = { kind: 'room'; roomId: string } | { kind: 'pool' }

export type DropCode = 'ROOM_FULL' | 'ROOM_INACTIVE' | 'ALREADY_IN_ROOM' | 'ALREADY_UNPLACED' | 'NOT_FOUND'

export type DropCheck = { ok: true } | { ok: false; code: DropCode; message: string }

export function pupilName(p: Pupil): string {
  return `${p.lastName} ${p.firstName}`.trim()
}

export function pupilFullName(p: Pupil): string {
  return [p.lastName, p.firstName, p.patronymic].filter(Boolean).join(' ')
}

export function comparePupils(a: Pupil, b: Pupil): number {
  return a.lastName.localeCompare(b.lastName, 'uk') || a.firstName.localeCompare(b.firstName, 'uk')
}

/** Номери кімнат порівнюються за числом, якщо це можливо («9» < «10»). */
export function compareRooms(a: RoomInfo, b: RoomInfo): number {
  return a.floor - b.floor || a.number.localeCompare(b.number, 'uk', { numeric: true })
}

export function freeSlots(room: RoomInfo): number {
  return room.capacity - room.occupied
}

export type RoomState = 'inactive' | 'full' | 'free'

export function roomState(room: RoomInfo): RoomState {
  if (!room.isActive) return 'inactive'
  return freeSlots(room) <= 0 ? 'full' : 'free'
}

export function groupRoomsByFloor(rooms: RoomInfo[], floors: readonly number[] = FLOORS): Map<number, RoomInfo[]> {
  const map = new Map<number, RoomInfo[]>(floors.map((f) => [f, []]))
  for (const r of [...rooms].sort(compareRooms)) {
    const list = map.get(r.floor)
    if (list) list.push(r)
  }
  return map
}

export function groupPupilsByRoom(rows: { roomId: string; pupil: Pupil }[]): Map<string, Pupil[]> {
  const map = new Map<string, Pupil[]>()
  for (const { roomId, pupil } of rows) {
    const list = map.get(roomId)
    if (list) list.push(pupil)
    else map.set(roomId, [pupil])
  }
  for (const list of map.values()) list.sort(comparePupils)
  return map
}

/**
 * Чи можна скинути учня в ціль. `fromRoomId` = null, якщо учень зараз у пулі.
 * Перевірка на клієнті лише для зручності: остаточне рішення завжди за сервером.
 */
export function validateDrop(fromRoomId: string | null, target: DropTarget, rooms: ReadonlyMap<string, RoomInfo>): DropCheck {
  if (target.kind === 'pool') {
    if (fromRoomId === null) {
      return { ok: false, code: 'ALREADY_UNPLACED', message: 'Учень уже серед нерозподілених.' }
    }
    return { ok: true }
  }
  const room = rooms.get(target.roomId)
  if (!room) return { ok: false, code: 'NOT_FOUND', message: 'Кімнату не знайдено. Оновіть сторінку.' }
  if (fromRoomId === room.id) {
    return { ok: false, code: 'ALREADY_IN_ROOM', message: `Учень уже живе в кімнаті ${room.number}.` }
  }
  if (!room.isActive) {
    return { ok: false, code: 'ROOM_INACTIVE', message: `Кімната ${room.number} неактивна — заселення неможливе.` }
  }
  if (freeSlots(room) <= 0) {
    return {
      ok: false,
      code: 'ROOM_FULL',
      message: `Кімната ${room.number} заповнена (${room.occupied}/${room.capacity}). Оберіть іншу кімнату.`,
    }
  }
  return { ok: true }
}

/** Яку функцію БД викликати для переміщення. */
export function pickOperation(fromRoomId: string | null, target: DropTarget): 'assign' | 'move' | 'unassign' {
  if (target.kind === 'pool') return 'unassign'
  return fromRoomId === null ? 'assign' : 'move'
}

// ------------------------------------------------------------ керування кімнатами

export type Validation = { ok: true } | { ok: false; message: string }

export function validateCapacity(capacity: number, occupied: number): Validation {
  if (!Number.isInteger(capacity) || capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) {
    return { ok: false, message: `Місткість — 4, 5 або 6 місць.` }
  }
  if (capacity < occupied) {
    return {
      ok: false,
      message: `Місткість не може бути меншою за кількість мешканців (зараз ${occupied}). Спершу переселіть учнів.`,
    }
  }
  return { ok: true }
}

export function validateDeactivate(occupied: number): Validation {
  return occupied > 0
    ? { ok: false, message: `Кімнату не можна деактивувати: у ній ще живуть учні (${occupied}). Спершу переселіть їх.` }
    : { ok: true }
}

export function validateNewRoom(
  input: { floor: number; number: string; capacity: number },
  existing: readonly Pick<RoomInfo, 'number'>[],
): Validation {
  const number = input.number.trim()
  if (!FLOORS.includes(input.floor as (typeof FLOORS)[number])) {
    return { ok: false, message: 'Поверх має бути від 2 до 5.' }
  }
  if (!number) return { ok: false, message: 'Вкажіть номер кімнати.' }
  if (number.length > 10) return { ok: false, message: 'Номер кімнати задовгий.' }
  if (existing.some((r) => r.number.trim().toLowerCase() === number.toLowerCase())) {
    return { ok: false, message: `Кімната ${number} уже існує.` }
  }
  return validateCapacity(input.capacity, 0)
}

// ------------------------------------------------------------------ помилки БД

const ERROR_MESSAGES: Record<string, string> = {
  ROOM_FULL: 'Кімната вже заповнена (можливо, її щойно зайняв інший вихователь). Дані оновлено.',
  ROOM_INACTIVE: 'Кімната неактивна — заселення неможливе.',
  ALREADY_PLACED: 'Учня вже заселено в кімнату (можливо, його щойно перемістив інший вихователь). Дані оновлено.',
  ALREADY_IN_ROOM: 'Учень уже живе в цій кімнаті.',
  NOT_PLACED: 'Учень уже не має кімнати (можливо, його щойно виселили). Дані оновлено.',
  STUDENT_NOT_ACTIVE: 'Учень не є активним — переміщення неможливе.',
  NOT_FOUND: 'Запис не знайдено. Дані оновлено.',
  FORBIDDEN: 'Недостатньо прав для цієї дії.',
  CAPACITY_BELOW_OCCUPANCY: 'Місткість не може бути меншою за кількість мешканців кімнати.',
  ROOM_NOT_EMPTY: 'Кімнату не можна деактивувати, поки в ній є мешканці.',
}

export const STALE_CODES: ReadonlySet<string> = new Set([
  'ROOM_FULL', 'ROOM_INACTIVE', 'ALREADY_PLACED', 'ALREADY_IN_ROOM', 'NOT_PLACED', 'NOT_FOUND', 'STUDENT_NOT_ACTIVE',
])

export function errorCode(error: { message?: string; code?: string } | null | undefined): string | null {
  const m = /^([A-Z_]{4,}):/.exec(error?.message ?? '')
  return m ? m[1] : null
}

/** Переклад помилки Supabase/Postgres українською. */
export function describeError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Невідома помилка.'
  const code = errorCode(error)
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (error.code === '23505') return 'Запис із такими даними вже існує (наприклад, номер кімнати).'
  if (error.code === '42501') return ERROR_MESSAGES.FORBIDDEN
  if (/failed to fetch|network/i.test(error.message ?? '')) return 'Немає зв’язку з сервером. Спробуйте ще раз.'
  return `Не вдалося виконати дію: ${error.message ?? 'невідома помилка'}`
}

// ---------------------------------------------------------------------- історія

export interface Stay {
  id: string
  studentId: string
  studentName: string
  roomId: string
  roomNumber: string
  fromDate: string
  toDate: string | null
  createdAt: string
  /** Кімната, з якої учня переселено напряму (move_student); null — прийшов з пулу «Нерозподілені». */
  fromRoomId: string | null
  fromRoomNumber: string | null
  movedBy: string | null
  reason: string | null
  endedBy: string | null
  endReason: string | null
}

export type StayEnd =
  | { kind: 'current' }
  | { kind: 'moved'; toRoomNumber: string }
  | { kind: 'unplaced' }

export interface HistoryEntry extends Stay {
  /** Куди учень пішов після цього проживання. */
  end: StayEnd
}

export const CAPACITY_CHOICES = [4, 5, 6] as const

/** Варіанти випадаючого списку місткості: 4–6 і поточне значення; менші за заселеність — недоступні. */
export function capacityOptions(current: number, occupied: number): { value: number; disabled: boolean }[] {
  const values = [...new Set<number>([...CAPACITY_CHOICES, current])].sort((a, b) => a - b)
  return values.map((value) => ({ value, disabled: value < occupied }))
}

/**
 * «Звідки» береться з явного поля from_room_id (його пише move_student), а не вгадується за датами.
 * «Куди» після проживання: якщо наступне проживання того ж учня має from_room_id = ця кімната —
 * переселено туди; інакше, якщо проживання закрите, — повернуто в «Нерозподілені».
 * Результат відсортовано від нових до старих.
 */
export function buildHistory(stays: readonly Stay[]): HistoryEntry[] {
  const byStudent = new Map<string, Stay[]>()
  for (const s of stays) {
    const l = byStudent.get(s.studentId)
    if (l) l.push(s)
    else byStudent.set(s.studentId, [s])
  }
  const out: HistoryEntry[] = []
  for (const list of byStudent.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    list.forEach((s, i) => {
      const next = i + 1 < list.length ? list[i + 1] : null
      const end: StayEnd =
        s.toDate === null
          ? { kind: 'current' }
          : next && next.fromRoomId === s.roomId
            ? { kind: 'moved', toRoomNumber: next.roomNumber }
            : { kind: 'unplaced' }
      out.push({ ...s, end })
    })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}
