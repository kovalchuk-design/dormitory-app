-- Students, rooms, room assignment history, occupancy view, move/assign functions.

-- ---------------------------------------------------------------- students
create table public.students (
  id               uuid primary key default gen_random_uuid(),
  last_name        text not null,
  first_name       text not null,
  patronymic       text,
  birth_date       date,
  grade            int not null check (grade between 9 and 11),
  status           text not null default 'active' check (status in ('active', 'graduated', 'left')),
  academic_year_id uuid references public.academic_years (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.students is 'Stable pupil identity. Questionnaire data is versioned in student_profiles.';
create index students_academic_year_id_idx on public.students (academic_year_id);
create index students_name_idx on public.students (last_name, first_name);
create index students_status_idx on public.students (status);
create trigger students_set_updated_at before update on public.students
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------------- rooms
create table public.rooms (
  id         uuid primary key default gen_random_uuid(),
  floor      int not null check (floor between 2 and 5),
  number     text not null unique,
  capacity   int not null default 4 check (capacity between 1 and 10),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_floor_idx on public.rooms (floor);
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------- room_assignments
create table public.room_assignments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete restrict,
  from_date  date not null default ((now() at time zone 'Europe/Kyiv')::date),
  to_date    date,                      -- NULL = open (current) assignment
  moved_by   uuid references public.profiles (id) on delete set null,
  reason     text,
  created_at timestamptz not null default now(),
  check (to_date is null or to_date >= from_date)
);
comment on table public.room_assignments is 'Full room history. Rows are never deleted by the app; only move_student/assign_student write here.';
create unique index room_assignments_one_open_per_student
  on public.room_assignments (student_id) where to_date is null;
create index room_assignments_open_room_idx on public.room_assignments (room_id) where to_date is null;
create index room_assignments_room_id_idx on public.room_assignments (room_id);
create index room_assignments_student_id_idx on public.room_assignments (student_id);
create index room_assignments_moved_by_idx on public.room_assignments (moved_by);

-- ----------------------------------------------------------------- helpers
create or replace function private.student_floor(p_student_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select r.floor
  from public.room_assignments ra join public.rooms r on r.id = ra.room_id
  where ra.student_id = p_student_id and ra.to_date is null
$$;

-- admin, or educator whose floor holds the pupil (unplaced pupils: any educator)
create or replace function private.can_edit_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.is_admin()
    or (private.current_app_role() = 'educator'
        and (private.student_floor(p_student_id) is null
             or private.student_floor(p_student_id) = private.current_floor())),
    false)
$$;

create or replace function private.room_occupied(p_room_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.room_assignments
  where room_id = p_room_id and to_date is null
$$;

revoke all on function private.student_floor(uuid), private.can_edit_student(uuid),
  private.room_occupied(uuid) from public, anon;
grant execute on function private.student_floor(uuid), private.can_edit_student(uuid),
  private.room_occupied(uuid) to authenticated, service_role;

-- rooms guard: educators may change capacity only; capacity/active never below occupancy
create or replace function private.rooms_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_occ int;
begin
  if current_user in ('authenticated', 'anon') and not private.is_admin()
     and (new.floor is distinct from old.floor
          or new.number is distinct from old.number
          or new.is_active is distinct from old.is_active) then
    raise exception 'FORBIDDEN: educators may only change room capacity' using errcode = '42501';
  end if;
  v_occ := private.room_occupied(old.id);
  if new.capacity < v_occ then
    raise exception 'CAPACITY_BELOW_OCCUPANCY: room % has % residents', old.number, v_occ using errcode = '23514';
  end if;
  if old.is_active and not new.is_active and v_occ > 0 then
    raise exception 'ROOM_NOT_EMPTY: room % has % residents', old.number, v_occ using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.rooms_guard() from public, anon, authenticated;
create trigger rooms_guard before update on public.rooms
  for each row execute function private.rooms_guard();

-- ------------------------------------------------------ privileges + policies
alter table public.students enable row level security;
alter table public.rooms enable row level security;
alter table public.room_assignments enable row level security;

revoke all on public.students, public.rooms, public.room_assignments from anon, authenticated;
grant select, insert, update, delete on public.students to authenticated, service_role;
grant select, insert, update, delete on public.rooms to authenticated, service_role;
grant select, delete on public.room_assignments to authenticated;
grant select, insert, update, delete on public.room_assignments to service_role;

-- students
create policy students_select on public.students for select to authenticated
  using ((select private.is_active_user()));
create policy students_insert on public.students for insert to authenticated
  with check ((select private.current_app_role()) in ('admin', 'educator'));
create policy students_update on public.students for update to authenticated
  using ((select private.can_edit_student(id)))
  with check ((select private.can_edit_student(id)));
create policy students_delete on public.students for delete to authenticated
  using ((select private.is_admin()));

-- rooms
create policy rooms_select on public.rooms for select to authenticated
  using ((select private.is_active_user()));
create policy rooms_insert on public.rooms for insert to authenticated
  with check ((select private.is_admin()));
create policy rooms_update on public.rooms for update to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and floor = (select private.current_floor())))
  with check ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and floor = (select private.current_floor())));
create policy rooms_delete on public.rooms for delete to authenticated
  using ((select private.is_admin()));

-- room_assignments: admin/educator read full history; staff_readonly only open rows.
-- No INSERT/UPDATE for API roles: use move_student() / assign_student().
create policy room_assignments_select on public.room_assignments for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator')
         or ((select private.current_app_role()) = 'staff_readonly' and to_date is null));
create policy room_assignments_delete on public.room_assignments for delete to authenticated
  using ((select private.is_admin()));

-- -------------------------------------------------------------------- view
create view public.v_room_occupancy with (security_invoker = true) as
select r.id as room_id,
       r.floor,
       r.number as room,
       r.capacity,
       r.is_active,
       count(ra.id)::int as occupied,
       (r.capacity - count(ra.id))::int as free
from public.rooms r
left join public.room_assignments ra on ra.room_id = r.id and ra.to_date is null
group by r.id;
revoke all on public.v_room_occupancy from anon, authenticated;
grant select on public.v_room_occupancy to authenticated, service_role;

-- --------------------------------------------------------------- functions
create or replace function public.assign_student(
  p_student_id uuid, p_room_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.current_app_role();
  v_floor int := private.current_floor();
  v_status text;
  v_room public.rooms;
  v_occ int;
  v_new uuid;
begin
  if v_role is null or v_role not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
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
  if exists (select 1 from public.room_assignments where student_id = p_student_id and to_date is null) then
    raise exception 'ALREADY_PLACED: student already has an open room assignment, use move_student' using errcode = '23505';
  end if;
  if v_role = 'educator' and v_floor is distinct from v_room.floor then
    raise exception 'FORBIDDEN: educator may place pupils only in rooms on their own floor' using errcode = '42501';
  end if;
  select count(*) into v_occ from public.room_assignments where room_id = p_room_id and to_date is null;
  if v_occ >= v_room.capacity then
    raise exception 'ROOM_FULL: room % is full (%/%)', v_room.number, v_occ, v_room.capacity using errcode = '23514';
  end if;
  insert into public.room_assignments (student_id, room_id, moved_by, reason)
  values (p_student_id, p_room_id, (select auth.uid()), p_reason)
  returning id into v_new;
  return v_new;
end $$;

create or replace function public.move_student(
  p_student_id uuid, p_room_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.current_app_role();
  v_floor int := private.current_floor();
  v_status text;
  v_room public.rooms;
  v_cur public.room_assignments;
  v_src_floor int;
  v_occ int;
  v_new uuid;
begin
  if v_role is null or v_role not in ('admin', 'educator') then
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
  select r.floor into v_src_floor from public.rooms r where r.id = v_cur.room_id;
  if v_role = 'educator'
     and v_floor is distinct from v_room.floor
     and v_floor is distinct from v_src_floor then
    raise exception 'FORBIDDEN: neither the source nor the target room is on your floor' using errcode = '42501';
  end if;
  select count(*) into v_occ from public.room_assignments where room_id = p_room_id and to_date is null;
  if v_occ >= v_room.capacity then
    raise exception 'ROOM_FULL: room % is full (%/%)', v_room.number, v_occ, v_room.capacity using errcode = '23514';
  end if;
  update public.room_assignments
     set to_date = (now() at time zone 'Europe/Kyiv')::date
   where id = v_cur.id;
  insert into public.room_assignments (student_id, room_id, moved_by, reason)
  values (p_student_id, p_room_id, (select auth.uid()), p_reason)
  returning id into v_new;
  return v_new;
end $$;

revoke all on function public.assign_student(uuid, uuid, text), public.move_student(uuid, uuid, text) from public, anon;
grant execute on function public.assign_student(uuid, uuid, text), public.move_student(uuid, uuid, text) to authenticated;
