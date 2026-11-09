import { describe, expect, it } from 'vitest'
import {
  buildHistory, compareRooms, describeError, errorCode, groupPupilsByRoom, groupRoomsByFloor, pickOperation,
  roomState, validateCapacity, validateDeactivate, validateDrop, validateNewRoom,
  type Pupil, type RoomInfo, type Stay,
} from './logic'

const room = (o: Partial<RoomInfo> & { id: string }): RoomInfo => ({
  floor: 2, number: o.id, capacity: 4, isActive: true, occupied: 0, ...o,
})
const rooms = new Map([
  room({ id: '202', floor: 2, occupied: 3 }),
  room({ id: '412', floor: 4, capacity: 5, occupied: 5 }),
  room({ id: '300', floor: 3, isActive: false }),
  room({ id: '501', floor: 5, capacity: 6, occupied: 2 }),
].map((r) => [r.id, r]))
const pupil = (id: string, last: string, first = 'А'): Pupil => ({ id, lastName: last, firstName: first, patronymic: null, grade: 10 })

describe('validateDrop', () => {
  it('дозволяє переміщення між поверхами у вільну кімнату', () => {
    expect(validateDrop('412', { kind: 'room', roomId: '501' }, rooms).ok).toBe(true)
    expect(validateDrop('202', { kind: 'room', roomId: '501' }, rooms).ok).toBe(true)
  })
  it('відхиляє заповнену кімнату', () => {
    const r = validateDrop('202', { kind: 'room', roomId: '412' }, rooms)
    expect(r).toMatchObject({ ok: false, code: 'ROOM_FULL' })
    expect(!r.ok && r.message).toContain('5/5')
  })
  it('відхиляє неактивну кімнату', () => {
    expect(validateDrop(null, { kind: 'room', roomId: '300' }, rooms)).toMatchObject({ ok: false, code: 'ROOM_INACTIVE' })
  })
  it('відхиляє ту саму кімнату і пул для нерозподіленого', () => {
    expect(validateDrop('202', { kind: 'room', roomId: '202' }, rooms)).toMatchObject({ code: 'ALREADY_IN_ROOM' })
    expect(validateDrop(null, { kind: 'pool' }, rooms)).toMatchObject({ code: 'ALREADY_UNPLACED' })
  })
  it('дозволяє повернення в пул і заселення з пулу', () => {
    expect(validateDrop('412', { kind: 'pool' }, rooms).ok).toBe(true)
    expect(validateDrop(null, { kind: 'room', roomId: '501' }, rooms).ok).toBe(true)
  })
  it('невідома кімната', () => {
    expect(validateDrop('202', { kind: 'room', roomId: 'x' }, rooms)).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('pickOperation', () => {
  it('обирає функцію БД', () => {
    expect(pickOperation(null, { kind: 'room', roomId: 'a' })).toBe('assign')
    expect(pickOperation('b', { kind: 'room', roomId: 'a' })).toBe('move')
    expect(pickOperation('b', { kind: 'pool' })).toBe('unassign')
  })
})

describe('місткість', () => {
  it('не нижче заселеності', () => {
    expect(validateCapacity(3, 4).ok).toBe(false)
    expect(validateCapacity(4, 4).ok).toBe(true)
    expect(validateCapacity(6, 4).ok).toBe(true)
  })
  it('межі та цілість', () => {
    expect(validateCapacity(0, 0).ok).toBe(false)
    expect(validateCapacity(11, 0).ok).toBe(false)
    expect(validateCapacity(4.5, 0).ok).toBe(false)
  })
  it('деактивація тільки порожньої кімнати', () => {
    expect(validateDeactivate(0).ok).toBe(true)
    expect(validateDeactivate(2).ok).toBe(false)
  })
  it('стан кімнати', () => {
    expect(roomState(rooms.get('202')!)).toBe('free')
    expect(roomState(rooms.get('412')!)).toBe('full')
    expect(roomState(rooms.get('300')!)).toBe('inactive')
  })
})

describe('validateNewRoom', () => {
  const existing = [{ number: '202' }]
  it('приймає коректну', () => expect(validateNewRoom({ floor: 3, number: ' 305 ', capacity: 4 }, existing).ok).toBe(true))
  it('відхиляє дубль без урахування регістру/пробілів', () => {
    expect(validateNewRoom({ floor: 2, number: ' 202', capacity: 4 }, existing).ok).toBe(false)
  })
  it('відхиляє поверх поза 2–5 і порожній номер', () => {
    expect(validateNewRoom({ floor: 1, number: '101', capacity: 4 }, existing).ok).toBe(false)
    expect(validateNewRoom({ floor: 6, number: '601', capacity: 4 }, existing).ok).toBe(false)
    expect(validateNewRoom({ floor: 2, number: '  ', capacity: 4 }, existing).ok).toBe(false)
  })
})

describe('групування', () => {
  it('кімнати за поверхами, числове сортування', () => {
    const g = groupRoomsByFloor([
      room({ id: 'a', floor: 3, number: '310' }), room({ id: 'b', floor: 3, number: '29' }), room({ id: 'c', floor: 5, number: '501' }),
      room({ id: 'd', floor: 9, number: '999' }),
    ])
    expect([...g.keys()]).toEqual([2, 3, 4, 5])
    expect(g.get(3)!.map((r) => r.number)).toEqual(['29', '310'])
    expect(g.get(2)).toEqual([])
    expect(compareRooms(room({ id: 'x', number: '9' }), room({ id: 'y', number: '10' }))).toBeLessThan(0)
  })
  it('учні за кімнатами, за абеткою', () => {
    const g = groupPupilsByRoom([
      { roomId: 'r1', pupil: pupil('1', 'Шевченко') }, { roomId: 'r1', pupil: pupil('2', 'Андрієнко') }, { roomId: 'r2', pupil: pupil('3', 'Бондар') },
    ])
    expect(g.get('r1')!.map((p) => p.lastName)).toEqual(['Андрієнко', 'Шевченко'])
    expect(g.get('r2')).toHaveLength(1)
  })
})

describe('помилки', () => {
  it('розпізнає код і перекладає', () => {
    expect(errorCode({ message: 'ROOM_FULL: room 202 is full (4/4)' })).toBe('ROOM_FULL')
    expect(describeError({ message: 'ROOM_FULL: room 202 is full (4/4)' })).toContain('заповнена')
    expect(describeError({ message: 'x', code: '42501' })).toContain('прав')
    expect(describeError({ message: 'duplicate', code: '23505' })).toContain('вже існує')
    expect(describeError({ message: 'CAPACITY_BELOW_OCCUPANCY: room 1 has 4 residents' })).toContain('меншою')
  })
})

describe('buildHistory', () => {
  const st = (o: Partial<Stay> & { id: string }): Stay => ({
    studentId: 's1', studentName: 'Іваненко', roomId: o.id, roomNumber: o.id, fromDate: '2026-09-01', toDate: null,
    createdAt: '2026-09-01T08:00:00Z', movedBy: null, reason: null, endedBy: null, endReason: null, ...o,
  })
  it('визначає «звідки» і сортує від нових до старих', () => {
    const h = buildHistory([
      st({ id: '412', fromDate: '2026-10-01', createdAt: '2026-10-01T08:00:00Z' }),
      st({ id: '202', toDate: '2026-10-01' }),
    ])
    expect(h.map((e) => e.roomNumber)).toEqual(['412', '202'])
    expect(h[0].fromRoomNumber).toBe('202')
    expect(h[1].fromRoomNumber).toBeNull()
  })
  it('після виселення в пул «звідки» порожнє', () => {
    const h = buildHistory([
      st({ id: '202', toDate: '2026-10-01' }),
      st({ id: '305', fromDate: '2026-10-20', createdAt: '2026-10-20T08:00:00Z' }),
    ])
    expect(h[0].fromRoomNumber).toBeNull()
  })
})
