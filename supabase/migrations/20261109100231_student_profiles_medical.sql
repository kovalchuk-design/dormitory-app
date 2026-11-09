-- Versioned questionnaire (student_profiles), medical data (student_medical), approval function.

create table public.student_profiles (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  version_no        int not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'superseded')),
  submitted_at      timestamptz not null default now(),
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  student_phone     text,
  address           text,
  group_number      text,
  profession        text,
  class_teacher     text,
  master            text,
  mother_name       text,
  mother_phone      text,
  father_name       text,
  father_phone      text,
  guardian_name     text,
  guardian_phone    text,
  school_activities text,
  college_plans     text,
  social_status     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id, version_no),
  check ((status = 'pending') = (approved_at is null))
);
comment on table public.student_profiles is 'Versioned pupil questionnaire. At most one approved version per pupil; old versions are kept as superseded.';
create unique index student_profiles_one_approved_per_student
  on public.student_profiles (student_id) where status = 'approved';
create index student_profiles_pending_idx on public.student_profiles (submitted_at) where status = 'pending';
create index student_profiles_approved_by_idx on public.student_profiles (approved_by);
create trigger student_profiles_set_updated_at before update on public.student_profiles
  for each row execute function private.set_updated_at();

-- version_no = next number per student (security definer: must see all versions regardless of RLS)
create or replace function private.student_profiles_set_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(max(sp.version_no), 0) + 1 into new.version_no
  from public.student_profiles sp where sp.student_id = new.student_id;
  return new;
end $$;
revoke all on function private.student_profiles_set_version() from public, anon, authenticated;
create trigger student_profiles_set_version before insert on public.student_profiles
  for each row execute function private.student_profiles_set_version();

-- API roles cannot change approval state or identity of a version; only approve_student_profile() can.
create or replace function private.student_profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.status is distinct from old.status
          or new.approved_by is distinct from old.approved_by
          or new.approved_at is distinct from old.approved_at
          or new.student_id is distinct from old.student_id
          or new.version_no is distinct from old.version_no
          or new.submitted_at is distinct from old.submitted_at) then
    raise exception 'FORBIDDEN: approval state can only be changed via approve_student_profile()' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.student_profiles_guard() from public, anon, authenticated;
create trigger student_profiles_guard before update on public.student_profiles
  for each row execute function private.student_profiles_guard();

alter table public.student_profiles enable row level security;
revoke all on public.student_profiles from anon, authenticated;
grant select, insert, update, delete on public.student_profiles to authenticated, service_role;

-- admin/educator: all versions. staff_readonly: approved only.
create policy student_profiles_select on public.student_profiles for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator')
         or ((select private.current_app_role()) = 'staff_readonly' and status = 'approved'));
-- new versions are always created as pending
create policy student_profiles_insert on public.student_profiles for insert to authenticated
  with check (status = 'pending' and approved_by is null and approved_at is null
              and (select private.can_edit_student(student_id)));
-- admin may fix any version; educators may edit only pending versions of their floor's pupils
create policy student_profiles_update on public.student_profiles for update to authenticated
  using ((select private.is_admin())
         or ((select private.can_edit_student(student_id)) and status = 'pending'))
  with check ((select private.is_admin())
         or ((select private.can_edit_student(student_id)) and status = 'pending'));
create policy student_profiles_delete on public.student_profiles for delete to authenticated
  using ((select private.is_admin()));

create or replace function public.approve_student_profile(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.student_profiles;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  select * into v_row from public.student_profiles where id = p_profile_id;
  if not found then raise exception 'NOT_FOUND: profile version' using errcode = 'P0002'; end if;
  if not private.can_edit_student(v_row.student_id) then
    raise exception 'FORBIDDEN: pupil is not on your floor' using errcode = '42501';
  end if;
  -- serialise concurrent approvals for the same pupil
  perform 1 from public.students where id = v_row.student_id for update;
  select * into v_row from public.student_profiles where id = p_profile_id for update;
  if v_row.status <> 'pending' then
    raise exception 'NOT_PENDING: version is already %', v_row.status using errcode = '23514';
  end if;
  update public.student_profiles set status = 'superseded'
   where student_id = v_row.student_id and status = 'approved';
  update public.student_profiles
     set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
   where id = p_profile_id;
end $$;
revoke all on function public.approve_student_profile(uuid) from public, anon;
grant execute on function public.approve_student_profile(uuid) to authenticated;

-- ---------------------------------------------------------- student_medical
create table public.student_medical (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null unique references public.students (id) on delete cascade,
  allergies          text,
  chronic_conditions text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.student_medical is 'Sensitive health data. Visible to admin and educators only; never to staff_readonly.';
create trigger student_medical_set_updated_at before update on public.student_medical
  for each row execute function private.set_updated_at();

alter table public.student_medical enable row level security;
revoke all on public.student_medical from anon, authenticated;
grant select, insert, update, delete on public.student_medical to authenticated, service_role;

create policy student_medical_select on public.student_medical for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'));
create policy student_medical_insert on public.student_medical for insert to authenticated
  with check ((select private.can_edit_student(student_id)));
create policy student_medical_update on public.student_medical for update to authenticated
  using ((select private.can_edit_student(student_id)))
  with check ((select private.can_edit_student(student_id)));
create policy student_medical_delete on public.student_medical for delete to authenticated
  using ((select private.is_admin()));
