-- Stage 2: public questionnaire flow + rejection of pending versions.
--  * student_profiles: status 'rejected', who/when rejected, fields the pupil submits that live outside `students`
--  * student_medical_submissions: pupil-submitted medical data, held until a version is approved (staff_readonly never sees it)
--  * approve_student_profile now applies submitted medical data; reject_student_profile is new
--  * questionnaire_rate_limits + questionnaire_rate_hit(): table-based rate limiting for the Edge Functions
--  * get_questionnaire_data / submit_questionnaire: token-checked, EXECUTE for service_role only
--    (called only from Edge Functions; anon/authenticated cannot call them)

-- ------------------------------------------------------------ student_profiles
alter table public.student_profiles drop constraint student_profiles_status_check;
alter table public.student_profiles drop constraint student_profiles_check;
alter table public.student_profiles
  add constraint student_profiles_status_check check (status in ('pending', 'approved', 'superseded', 'rejected')),
  add constraint student_profiles_approval_check check ((status in ('pending', 'rejected')) = (approved_at is null));

alter table public.student_profiles
  add column submitted_full_name  text,
  add column submitted_birth_date date,
  add column submitted_room       text,
  add column consent_at           timestamptz,
  add column rejected_by          uuid references public.profiles (id) on delete set null,
  add column rejected_at          timestamptz;
create index student_profiles_rejected_by_idx on public.student_profiles (rejected_by);
comment on column public.student_profiles.submitted_full_name is 'ПІБ as typed by the pupil (students.* is changed only by staff).';
comment on column public.student_profiles.consent_at is 'When the pupil ticked the personal-data consent box.';

create or replace function private.student_profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.status is distinct from old.status
          or new.approved_by is distinct from old.approved_by
          or new.approved_at is distinct from old.approved_at
          or new.rejected_by is distinct from old.rejected_by
          or new.rejected_at is distinct from old.rejected_at
          or new.consent_at is distinct from old.consent_at
          or new.student_id is distinct from old.student_id
          or new.version_no is distinct from old.version_no
          or new.submitted_at is distinct from old.submitted_at) then
    raise exception 'FORBIDDEN: approval state can only be changed via approve_student_profile()/reject_student_profile()' using errcode = '42501';
  end if;
  return new;
end $$;

-- --------------------------------------------------- student_medical_submissions
create table public.student_medical_submissions (
  profile_id         uuid primary key references public.student_profiles (id) on delete cascade,
  allergies          text,
  chronic_conditions text,
  created_at         timestamptz not null default now()
);
comment on table public.student_medical_submissions is
  'Medical data typed by a pupil in the public form. Applied to student_medical only when the version is approved. admin/educator only.';
alter table public.student_medical_submissions enable row level security;
revoke all on public.student_medical_submissions from anon, authenticated;
grant select on public.student_medical_submissions to authenticated;
grant select, insert, update, delete on public.student_medical_submissions to service_role;
create policy student_medical_submissions_select on public.student_medical_submissions for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'));

-- ----------------------------------------------------------- approve / reject
create or replace function public.approve_student_profile(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.student_profiles;
  v_med public.student_medical_submissions;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  select * into v_row from public.student_profiles where id = p_profile_id;
  if not found then raise exception 'NOT_FOUND: profile version' using errcode = 'P0002'; end if;
  if not private.can_edit_student(v_row.student_id) then
    raise exception 'FORBIDDEN: not allowed to edit this pupil' using errcode = '42501';
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

  -- medical data typed by the pupil becomes current only on approval; blank fields keep the existing value
  select * into v_med from public.student_medical_submissions where profile_id = p_profile_id;
  if found then
    insert into public.student_medical as m (student_id, allergies, chronic_conditions)
    values (v_row.student_id, v_med.allergies, v_med.chronic_conditions)
    on conflict (student_id) do update
      set allergies = coalesce(excluded.allergies, m.allergies),
          chronic_conditions = coalesce(excluded.chronic_conditions, m.chronic_conditions);
  end if;
end $$;
revoke all on function public.approve_student_profile(uuid) from public, anon;
grant execute on function public.approve_student_profile(uuid) to authenticated;

create or replace function public.reject_student_profile(p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.student_profiles;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  select * into v_row from public.student_profiles where id = p_profile_id for update;
  if not found then raise exception 'NOT_FOUND: profile version' using errcode = 'P0002'; end if;
  if not private.can_edit_student(v_row.student_id) then
    raise exception 'FORBIDDEN: not allowed to edit this pupil' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'NOT_PENDING: version is already %', v_row.status using errcode = '23514';
  end if;
  update public.student_profiles
     set status = 'rejected', rejected_by = (select auth.uid()), rejected_at = now()
   where id = p_profile_id;
end $$;
revoke all on function public.reject_student_profile(uuid) from public, anon;
grant execute on function public.reject_student_profile(uuid) to authenticated;

-- ---------------------------------------------------------------- rate limiting
create table public.questionnaire_rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);
comment on table public.questionnaire_rate_limits is 'Fixed-window counters for the public Edge Functions. service_role only; no API policies on purpose.';
alter table public.questionnaire_rate_limits enable row level security;
revoke all on public.questionnaire_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.questionnaire_rate_limits to service_role;

-- returns true when the call is still within the limit
create or replace function public.questionnaire_rate_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits int;
begin
  insert into public.questionnaire_rate_limits as rl (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update
    set hits = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
        window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning hits into v_hits;
  if random() < 0.02 then
    delete from public.questionnaire_rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end $$;
revoke all on function public.questionnaire_rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.questionnaire_rate_hit(text, int, int) to service_role;

-- ------------------------------------------------------- public form (via Edge Functions)
-- p_token_hash = sha256 hex of the raw token (same as create_update_request).
-- Returns NULL for unknown / expired / used / inactive-pupil links (callers must not distinguish).
create or replace function public.get_questionnaire_data(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_student public.students;
  v_prof public.student_profiles;
  v_room text;
begin
  select s.* into v_student
    from public.update_requests ur join public.students s on s.id = ur.student_id
   where ur.token_hash = p_token_hash and ur.used_at is null and ur.expires_at > now() and s.status = 'active';
  if not found then return null; end if;
  select r.number into v_room
    from public.room_assignments ra join public.rooms r on r.id = ra.room_id
   where ra.student_id = v_student.id and ra.to_date is null;
  select * into v_prof from public.student_profiles where student_id = v_student.id and status = 'approved';
  return jsonb_build_object(
    'full_name', coalesce(v_prof.submitted_full_name, concat_ws(' ', v_student.last_name, v_student.first_name, v_student.patronymic)),
    'birth_date', coalesce(v_prof.submitted_birth_date, v_student.birth_date),
    'room', v_room,
    'profile', case when v_prof.id is null then null else jsonb_build_object(
      'group_number', v_prof.group_number, 'profession', v_prof.profession,
      'class_teacher', v_prof.class_teacher, 'master', v_prof.master, 'address', v_prof.address,
      'student_phone', v_prof.student_phone,
      'mother_name', v_prof.mother_name, 'mother_phone', v_prof.mother_phone,
      'father_name', v_prof.father_name, 'father_phone', v_prof.father_phone,
      'guardian_name', v_prof.guardian_name, 'guardian_phone', v_prof.guardian_phone,
      'school_activities', v_prof.school_activities, 'college_plans', v_prof.college_plans,
      'social_status', v_prof.social_status) end);
end $$;
revoke all on function public.get_questionnaire_data(text) from public, anon, authenticated;
grant execute on function public.get_questionnaire_data(text) to service_role;

-- One transaction: lock the link, re-validate it, burn it, insert a pending version (+ held medical data).
-- Payload must already be validated by the Edge Function. Returns false for an invalid link or missing consent.
create or replace function public.submit_questionnaire(p_token_hash text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_req public.update_requests;
  v_pid uuid;
  v_all text := nullif(btrim(p_payload ->> 'allergies'), '');
  v_chr text := nullif(btrim(p_payload ->> 'chronic_conditions'), '');
begin
  if coalesce((p_payload ->> 'consent')::boolean, false) is not true then return false; end if;
  select ur.* into v_req
    from public.update_requests ur join public.students s on s.id = ur.student_id
   where ur.token_hash = p_token_hash and ur.used_at is null and ur.expires_at > now() and s.status = 'active'
   for update of ur;
  if not found then return false; end if;

  update public.update_requests set used_at = now() where id = v_req.id;

  insert into public.student_profiles (
    student_id, status, submitted_full_name, submitted_birth_date, submitted_room, group_number, profession,
    class_teacher, master, address, student_phone, mother_name, mother_phone, father_name, father_phone,
    guardian_name, guardian_phone, school_activities, college_plans, social_status, consent_at)
  values (
    v_req.student_id, 'pending',
    nullif(btrim(p_payload ->> 'full_name'), ''), nullif(p_payload ->> 'birth_date', '')::date,
    nullif(btrim(p_payload ->> 'room'), ''), nullif(btrim(p_payload ->> 'group_number'), ''),
    nullif(btrim(p_payload ->> 'profession'), ''), nullif(btrim(p_payload ->> 'class_teacher'), ''),
    nullif(btrim(p_payload ->> 'master'), ''), nullif(btrim(p_payload ->> 'address'), ''),
    nullif(btrim(p_payload ->> 'student_phone'), ''),
    nullif(btrim(p_payload ->> 'mother_name'), ''), nullif(btrim(p_payload ->> 'mother_phone'), ''),
    nullif(btrim(p_payload ->> 'father_name'), ''), nullif(btrim(p_payload ->> 'father_phone'), ''),
    nullif(btrim(p_payload ->> 'guardian_name'), ''), nullif(btrim(p_payload ->> 'guardian_phone'), ''),
    nullif(btrim(p_payload ->> 'school_activities'), ''), nullif(btrim(p_payload ->> 'college_plans'), ''),
    nullif(btrim(p_payload ->> 'social_status'), ''), now())
  returning id into v_pid;

  update public.update_requests set resulting_profile_id = v_pid where id = v_req.id;
  if v_all is not null or v_chr is not null then
    insert into public.student_medical_submissions (profile_id, allergies, chronic_conditions)
    values (v_pid, v_all, v_chr);
  end if;
  return true;
end $$;
revoke all on function public.submit_questionnaire(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_questionnaire(text, jsonb) to service_role;
