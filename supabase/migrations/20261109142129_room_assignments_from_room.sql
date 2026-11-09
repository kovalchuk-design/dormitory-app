-- Stage 3: always record WHERE a pupil moved from.
-- Before: "from" had to be guessed from dates (ambiguous for same-day unassign + assign).
-- Now: move_student stores the previous room in the new row (from_room_id).
-- NULL from_room_id = the pupil came from the "unplaced" pool (assign_student) or is new.

alter table public.room_assignments
  add column from_room_id uuid references public.rooms (id) on delete set null;
create index room_assignments_from_room_id_idx on public.room_assignments (from_room_id);
comment on column public.room_assignments.from_room_id is
  'Room the pupil was moved directly from (move_student). NULL = came from the unplaced pool.';

create or replace function public.move_student(
  p_student_id uuid, p_room_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_room public.rooms;
  v_cur public.room_assignments;
  v_occ int;
  v_new uuid;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  -- lock order: student, then target room
  select s.status into v_status from public.students s where s.id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND: student' using errcode = 'P0002'; end if;
  if v_status <> 'active' then
    raise exception 'STUDENT_NOT_ACTIVE: student status is %', v_status using errcode = '23514';
  end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'NOT_FOUND: room' using errcode = 'P0002'; end if;
  if not v_room.is_active then
    raise exception 'ROOM_INACTIVE: room % is not active', v_room.number using errcode = '23514';
  end if;
  select * into v_cur from public.room_assignments where student_id = p_student_id and to_date is null;
  if not found then
    raise exception 'NOT_PLACED: student has no current room, use assign_student' using errcode = 'P0002';
  end if;
  if v_cur.room_id = p_room_id then
    raise exception 'ALREADY_IN_ROOM: student already lives in room %', v_room.number using errcode = '23505';
  end if;
  select count(*) into v_occ from public.room_assignments where room_id = p_room_id and to_date is null;
  if v_occ >= v_room.capacity then
    raise exception 'ROOM_FULL: room % is full (%/%)', v_room.number, v_occ, v_room.capacity using errcode = '23514';
  end if;
  update public.room_assignments
     set to_date = (now() at time zone 'Europe/Kyiv')::date,
         ended_by = (select auth.uid()),
         end_reason = p_reason
   where id = v_cur.id;
  insert into public.room_assignments (student_id, room_id, from_room_id, moved_by, reason)
  values (p_student_id, p_room_id, v_cur.room_id, (select auth.uid()), p_reason)
  returning id into v_new;
  return v_new;
end $$;

revoke all on function public.move_student(uuid, uuid, text) from public, anon;
grant execute on function public.move_student(uuid, uuid, text) to authenticated;
