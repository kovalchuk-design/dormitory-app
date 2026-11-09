-- Floor is no longer a permission boundary (educators work in shifts and cover ALL floors).
-- profiles.floor stays as an informational "home floor". Adds: unassign_student, v_unplaced_students,
-- app_settings (permission toggles), template write toggle, room history readable by all active users.

comment on column public.profiles.floor is 'Home floor (informational, UI default filter). NOT a permission boundary.';

-- 1. any active educator/admin can edit any pupil's data (pupils, questionnaires, medical, link metadata)
create or replace function private.can_edit_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() in ('admin', 'educator'), false)
$$;

-- educators may change capacity of ANY room (rooms_guard still blocks rename / floor / deactivate for non-admins)
drop policy rooms_update on public.rooms;
create policy rooms_update on public.rooms for update to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'))
  with check ((select private.current_app_role()) in ('admin', 'educator'));

-- 6. room history readable by all active users; record who/why a stay ended
drop policy room_assignments_select on public.room_assignments;
create policy room_assignments_select on public.room_assignments for select to authenticated
  using ((select private.is_active_user()));

alter table public.room_assignments
  add column ended_by uuid references public.profiles (id) on delete set null,
  add column end_reason text;
create index room_assignments_ended_by_idx on public.room_assignments (ended_by);

-- 2. functions without floor checks
create or replace function public.assign_student(
  p_student_id uuid, p_room_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_room public.rooms;
  v_occ int;
  v_new uuid;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
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
  insert into public.room_assignments (student_id, room_id, moved_by, reason)
  values (p_student_id, p_room_id, (select auth.uid()), p_reason)
  returning id into v_new;
  return v_new;
end $$;

-- back to the "unplaced" pool; history is kept (works for any pupil status, e.g. left)
create or replace function public.unassign_student(p_student_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_cur public.room_assignments;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  perform 1 from public.students where id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND: student' using errcode = 'P0002'; end if;
  select * into v_cur from public.room_assignments
   where student_id = p_student_id and to_date is null for update;
  if not found then
    raise exception 'NOT_PLACED: student has no current room' using errcode = 'P0002';
  end if;
  update public.room_assignments
     set to_date = (now() at time zone 'Europe/Kyiv')::date,
         ended_by = (select auth.uid()),
         end_reason = p_reason
   where id = v_cur.id;
  return v_cur.id;
end $$;

revoke all on function public.assign_student(uuid, uuid, text), public.move_student(uuid, uuid, text),
  public.unassign_student(uuid, text) from public, anon;
grant execute on function public.assign_student(uuid, uuid, text), public.move_student(uuid, uuid, text),
  public.unassign_student(uuid, text) to authenticated;

-- unplaced pool
create view public.v_unplaced_students with (security_invoker = true) as
select s.id, s.last_name, s.first_name, s.patronymic, s.grade, s.academic_year_id, s.created_at
from public.students s
where s.status = 'active'
  and not exists (select 1 from public.room_assignments ra
                  where ra.student_id = s.id and ra.to_date is null);
revoke all on public.v_unplaced_students from anon, authenticated;
grant select on public.v_unplaced_students to authenticated, service_role;

-- 5. app_settings: generic permission toggles
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.app_settings is 'Admin-managed toggles, e.g. educators_can_edit_templates (jsonb true/false).';
create index app_settings_updated_by_idx on public.app_settings (updated_by);

create or replace function private.app_settings_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
revoke all on function private.app_settings_touch() from public, anon, authenticated;
create trigger app_settings_touch before insert or update on public.app_settings
  for each row execute function private.app_settings_touch();

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select, insert, update, delete on public.app_settings to authenticated, service_role;
create policy app_settings_select on public.app_settings for select to authenticated
  using ((select private.is_active_user()));
create policy app_settings_insert on public.app_settings for insert to authenticated
  with check ((select private.is_admin()));
create policy app_settings_update on public.app_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy app_settings_delete on public.app_settings for delete to authenticated
  using ((select private.is_admin()));

create or replace function private.app_setting_true(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value = 'true'::jsonb from public.app_settings s where s.key = p_key), false)
$$;
revoke all on function private.app_setting_true(text) from public, anon;
grant execute on function private.app_setting_true(text) to authenticated, service_role;

insert into public.app_settings (key, value) values ('educators_can_edit_templates', 'false'::jsonb)
on conflict (key) do nothing;

-- document_templates: admin always; educators only when the toggle is on
drop policy document_templates_insert on public.document_templates;
drop policy document_templates_update on public.document_templates;
drop policy document_templates_delete on public.document_templates;
create policy document_templates_insert on public.document_templates for insert to authenticated
  with check ((select private.is_admin())
    or ((select private.current_app_role()) = 'educator'
        and (select private.app_setting_true('educators_can_edit_templates'))));
create policy document_templates_update on public.document_templates for update to authenticated
  using ((select private.is_admin())
    or ((select private.current_app_role()) = 'educator'
        and (select private.app_setting_true('educators_can_edit_templates'))))
  with check ((select private.is_admin())
    or ((select private.current_app_role()) = 'educator'
        and (select private.app_setting_true('educators_can_edit_templates'))));
create policy document_templates_delete on public.document_templates for delete to authenticated
  using ((select private.is_admin())
    or ((select private.current_app_role()) = 'educator'
        and (select private.app_setting_true('educators_can_edit_templates'))));
