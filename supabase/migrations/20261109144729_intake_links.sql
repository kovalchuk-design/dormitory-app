-- Shared per-floor intake links: one link goes to a floor's group chat, every pupil fills in the form themself.
-- A submission is matched to the pupil base ONLY by exact ПІБ + birth date (unique, active pupil) — otherwise it lands in the
-- "unmatched" queue. A person always approves the resulting pending version (approve_student_profile is unchanged).
--  * intake_links          — shared links (sha256 hash only), expiry, revocation, submission cap; at most one live link per floor
--  * intake_submissions    — who filled in via which link, match result; the raw answers are kept ONLY while unmatched (data minimisation)
--  * helpers/RPCs          — create/revoke link, resolve/create-student/dismiss unmatched; service-only: get_intake_link_state, submit_intake

-- ----------------------------------------------------------------- helpers
create or replace function private.norm_name(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(lower(coalesce(p, '')), '[''’ʼ`]', '', 'g'),
    '[^а-яіїєґё0-9a-z]+', ' ', 'g'))
$$;
revoke all on function private.norm_name(text) from public, anon, authenticated;

-- one place that turns a validated questionnaire payload into a pending version (+ held medical data)
create or replace function private.insert_pending_profile(p_student_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pid uuid;
  v_all text := nullif(btrim(p_payload ->> 'allergies'), '');
  v_chr text := nullif(btrim(p_payload ->> 'chronic_conditions'), '');
  v_social jsonb := jsonb_strip_nulls(jsonb_build_object(
    'codes', coalesce(p_payload -> 'social_codes', '[]'::jsonb),
    'children_count', nullif(btrim(p_payload ->> 'social_children'), ''),
    'ato', nullif(btrim(p_payload ->> 'social_ato'), ''),
    'zsu', nullif(btrim(p_payload ->> 'social_zsu'), '')));
begin
  insert into public.student_profiles (
    student_id, status, submitted_full_name, submitted_birth_date, submitted_room, group_number, profession,
    class_teacher, master, address, student_phone, mother_name, mother_phone, father_name, father_phone,
    guardian_name, guardian_phone, guardian_relation, school_activities, college_plans, social_status,
    social_status_data, consent_at)
  values (
    p_student_id, 'pending',
    nullif(btrim(p_payload ->> 'full_name'), ''), nullif(p_payload ->> 'birth_date', '')::date,
    nullif(btrim(p_payload ->> 'room'), ''), nullif(btrim(p_payload ->> 'group_number'), ''),
    nullif(btrim(p_payload ->> 'profession'), ''), nullif(btrim(p_payload ->> 'class_teacher'), ''),
    nullif(btrim(p_payload ->> 'master'), ''), nullif(btrim(p_payload ->> 'address'), ''),
    nullif(btrim(p_payload ->> 'student_phone'), ''),
    nullif(btrim(p_payload ->> 'mother_name'), ''), nullif(btrim(p_payload ->> 'mother_phone'), ''),
    nullif(btrim(p_payload ->> 'father_name'), ''), nullif(btrim(p_payload ->> 'father_phone'), ''),
    nullif(btrim(p_payload ->> 'guardian_name'), ''), nullif(btrim(p_payload ->> 'guardian_phone'), ''),
    nullif(btrim(p_payload ->> 'guardian_relation'), ''),
    nullif(btrim(p_payload ->> 'school_activities'), ''), nullif(btrim(p_payload ->> 'college_plans'), ''),
    nullif(btrim(p_payload ->> 'social_status'), ''), v_social, now())
  returning id into v_pid;
  if v_all is not null or v_chr is not null then
    insert into public.student_medical_submissions (profile_id, allergies, chronic_conditions)
    values (v_pid, v_all, v_chr);
  end if;
  return v_pid;
end $$;
revoke all on function private.insert_pending_profile(uuid, jsonb) from public, anon, authenticated;

-- personal-link submit now uses the helper (behaviour unchanged)
create or replace function public.submit_questionnaire(p_token_hash text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_req public.update_requests;
  v_pid uuid;
begin
  if coalesce((p_payload ->> 'consent')::boolean, false) is not true then return false; end if;
  select ur.* into v_req
    from public.update_requests ur join public.students s on s.id = ur.student_id
   where ur.token_hash = p_token_hash and ur.used_at is null and ur.expires_at > now() and s.status = 'active'
   for update of ur;
  if not found then return false; end if;
  update public.update_requests set used_at = now() where id = v_req.id;
  v_pid := private.insert_pending_profile(v_req.student_id, p_payload);
  update public.update_requests set resulting_profile_id = v_pid where id = v_req.id;
  return true;
end $$;
revoke all on function public.submit_questionnaire(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_questionnaire(text, jsonb) to service_role;

-- ------------------------------------------------------------- intake_links
create table public.intake_links (
  id              uuid primary key default gen_random_uuid(),
  floor           int check (floor between 2 and 5),
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  max_submissions int not null default 500 check (max_submissions between 1 and 2000),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (expires_at >= created_at)
);
comment on table public.intake_links is 'Shared per-floor questionnaire links. Only the sha256 hash of the token is stored; at most one live link per floor (create_intake_link revokes the previous one).';
create index intake_links_created_by_idx on public.intake_links (created_by);
alter table public.intake_links enable row level security;
revoke all on public.intake_links from anon, authenticated;
grant select (id, floor, expires_at, revoked_at, max_submissions, created_by, created_at) on public.intake_links to authenticated;
grant select, insert, update, delete on public.intake_links to service_role;
create policy intake_links_select on public.intake_links for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'));

-- ------------------------------------------------------- intake_submissions
create table public.intake_submissions (
  id                   uuid primary key default gen_random_uuid(),
  link_id              uuid not null references public.intake_links (id) on delete cascade,
  submitted_at         timestamptz not null default now(),
  submitted_full_name  text not null,
  submitted_birth_date date not null,
  payload              jsonb,   -- answers; kept ONLY while status = 'unmatched', then cleared
  status               text not null default 'unmatched' check (status in ('matched', 'unmatched', 'dismissed')),
  match_method         text check (match_method in ('auto', 'manual', 'new_student')),
  student_id           uuid references public.students (id) on delete set null,
  profile_id           uuid references public.student_profiles (id) on delete set null,
  resolved_by          uuid references public.profiles (id) on delete set null,
  resolved_at          timestamptz,
  check ((status = 'unmatched') = (payload is not null))
);
comment on table public.intake_submissions is 'Who filled in via a shared link and how it was matched to the pupil base. Contains personal data: admin/educator only.';
create index intake_submissions_link_idx on public.intake_submissions (link_id);
create index intake_submissions_student_idx on public.intake_submissions (student_id);
create index intake_submissions_profile_idx on public.intake_submissions (profile_id);
create index intake_submissions_resolved_by_idx on public.intake_submissions (resolved_by);
create index intake_submissions_unmatched_idx on public.intake_submissions (submitted_at) where status = 'unmatched';
alter table public.intake_submissions enable row level security;
revoke all on public.intake_submissions from anon, authenticated;
grant select on public.intake_submissions to authenticated;
grant select, insert, update, delete on public.intake_submissions to service_role;
create policy intake_submissions_select on public.intake_submissions for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'));

-- ----------------------------------------------------- staff: create / revoke
create or replace function public.create_intake_link(p_floor int, p_ttl_days int default 7)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  if p_floor is not null and p_floor not between 2 and 5 then
    raise exception 'INVALID: floor must be 2..5' using errcode = '22023';
  end if;
  if p_ttl_days is null or p_ttl_days < 1 or p_ttl_days > 30 then
    raise exception 'INVALID: ttl_days must be 1..30' using errcode = '22023';
  end if;
  -- one live link per floor: issuing a new one cancels the previous
  update public.intake_links set revoked_at = now()
   where floor is not distinct from p_floor and revoked_at is null and expires_at > now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.intake_links (floor, token_hash, expires_at, created_by)
  values (p_floor, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + make_interval(days => p_ttl_days), (select auth.uid()));
  return v_token;   -- the only moment the raw token exists
end $$;
revoke all on function public.create_intake_link(int, int) from public, anon;
grant execute on function public.create_intake_link(int, int) to authenticated;

create or replace function public.revoke_intake_link(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  update public.intake_links set revoked_at = now() where id = p_link_id and revoked_at is null;
  if not found then raise exception 'NOT_FOUND: active link' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.revoke_intake_link(uuid) from public, anon;
grant execute on function public.revoke_intake_link(uuid) to authenticated;

-- ------------------------------------------------- public (service_role only)
create or replace function public.get_intake_link_state(p_token_hash text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.intake_links l
     where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
       and (select count(*) from public.intake_submissions s where s.link_id = l.id) < l.max_submissions)
$$;
revoke all on function public.get_intake_link_state(text) from public, anon, authenticated;
grant execute on function public.get_intake_link_state(text) to service_role;

-- Valid link → always true (the pupil never learns whether a match happened). Invalid link / no consent → false.
create or replace function public.submit_intake(p_token_hash text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_link public.intake_links;
  v_name text := nullif(btrim(p_payload ->> 'full_name'), '');
  v_dob date;
  v_cnt int;
  v_match uuid;
  v_sub uuid;
  v_pid uuid;
begin
  if coalesce((p_payload ->> 'consent')::boolean, false) is not true then return false; end if;
  if v_name is null or nullif(p_payload ->> 'birth_date', '') is null then return false; end if;
  v_dob := (p_payload ->> 'birth_date')::date;

  select * into v_link from public.intake_links
   where token_hash = p_token_hash and revoked_at is null and expires_at > now()
   for update;                       -- serialises the submission cap
  if not found then return false; end if;
  if (select count(*) from public.intake_submissions where link_id = v_link.id) >= v_link.max_submissions then
    return false;
  end if;

  -- exact ПІБ (case/space/apostrophe-insensitive) + birth date
  select count(*), (array_agg(s.id))[1] into v_cnt, v_match
    from public.students s
   where s.birth_date = v_dob
     and private.norm_name(concat_ws(' ', s.last_name, s.first_name, s.patronymic)) = private.norm_name(v_name);

  insert into public.intake_submissions (link_id, submitted_full_name, submitted_birth_date, payload)
  values (v_link.id, v_name, v_dob, p_payload)
  returning id into v_sub;

  -- auto-match only: a single pupil, active, not already flooded with pending versions
  if v_cnt = 1
     and (select s.status from public.students s where s.id = v_match) = 'active'
     and (select count(*) from public.student_profiles sp where sp.student_id = v_match and sp.status = 'pending') < 5 then
    v_pid := private.insert_pending_profile(v_match, p_payload);
    update public.intake_submissions
       set status = 'matched', match_method = 'auto', student_id = v_match, profile_id = v_pid,
           resolved_at = now(), payload = null
     where id = v_sub;
  end if;
  return true;
end $$;
revoke all on function public.submit_intake(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_intake(text, jsonb) to service_role;

-- ------------------------------------------------- staff: resolve unmatched
create or replace function public.resolve_intake_submission(p_submission_id uuid, p_student_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_sub public.intake_submissions;
  v_status text;
  v_pid uuid;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  select * into v_sub from public.intake_submissions where id = p_submission_id for update;
  if not found then raise exception 'NOT_FOUND: submission' using errcode = 'P0002'; end if;
  if v_sub.status <> 'unmatched' then raise exception 'NOT_PENDING: submission is already %', v_sub.status using errcode = '23514'; end if;
  select status into v_status from public.students where id = p_student_id;
  if not found then raise exception 'NOT_FOUND: student' using errcode = 'P0002'; end if;
  if v_status <> 'active' then raise exception 'STUDENT_NOT_ACTIVE: student status is %', v_status using errcode = '23514'; end if;

  v_pid := private.insert_pending_profile(p_student_id, v_sub.payload);
  update public.students set birth_date = v_sub.submitted_birth_date where id = p_student_id and birth_date is null;
  update public.intake_submissions
     set status = 'matched', match_method = 'manual', student_id = p_student_id, profile_id = v_pid,
         resolved_by = (select auth.uid()), resolved_at = now(), payload = null
   where id = p_submission_id;
  return v_pid;
end $$;
revoke all on function public.resolve_intake_submission(uuid, uuid) from public, anon;
grant execute on function public.resolve_intake_submission(uuid, uuid) to authenticated;

create or replace function public.create_student_from_intake(p_submission_id uuid, p_grade int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_sub public.intake_submissions;
  v_parts text[];
  v_student uuid;
  v_pid uuid;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  if p_grade is null or p_grade not between 9 and 11 then raise exception 'INVALID: grade must be 9..11' using errcode = '22023'; end if;
  select * into v_sub from public.intake_submissions where id = p_submission_id for update;
  if not found then raise exception 'NOT_FOUND: submission' using errcode = 'P0002'; end if;
  if v_sub.status <> 'unmatched' then raise exception 'NOT_PENDING: submission is already %', v_sub.status using errcode = '23514'; end if;
  v_parts := regexp_split_to_array(btrim(v_sub.submitted_full_name), '\s+');
  if array_length(v_parts, 1) < 2 then raise exception 'INVALID: need surname and first name' using errcode = '22023'; end if;

  insert into public.students (last_name, first_name, patronymic, birth_date, grade, academic_year_id)
  values (v_parts[1], v_parts[2], nullif(array_to_string(v_parts[3:], ' '), ''), v_sub.submitted_birth_date, p_grade,
          (select ay.id from public.academic_years ay where ay.is_current limit 1))
  returning id into v_student;
  v_pid := private.insert_pending_profile(v_student, v_sub.payload);
  update public.intake_submissions
     set status = 'matched', match_method = 'new_student', student_id = v_student, profile_id = v_pid,
         resolved_by = (select auth.uid()), resolved_at = now(), payload = null
   where id = p_submission_id;
  return v_student;
end $$;
revoke all on function public.create_student_from_intake(uuid, int) from public, anon;
grant execute on function public.create_student_from_intake(uuid, int) to authenticated;

create or replace function public.dismiss_intake_submission(p_submission_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  update public.intake_submissions
     set status = 'dismissed', resolved_by = (select auth.uid()), resolved_at = now(), payload = null
   where id = p_submission_id and status = 'unmatched';
  if not found then raise exception 'NOT_FOUND: unmatched submission' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.dismiss_intake_submission(uuid) from public, anon;
grant execute on function public.dismiss_intake_submission(uuid) to authenticated;
