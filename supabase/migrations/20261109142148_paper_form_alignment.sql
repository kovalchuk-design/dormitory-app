-- Align the questionnaire with the paper form used by the administration:
--  * guardian_relation: who the "guardian" is to the pupil (grandmother, uncle, ...) — often sits in the mother/father slot on paper
--  * social_status_data: structured social status (checklist 1-8 + details); social_status keeps the human-readable text
alter table public.student_profiles
  add column guardian_relation  text,
  add column social_status_data jsonb;
comment on column public.student_profiles.guardian_relation is 'Guardian relationship to the pupil (бабуся, дядько, ...).';
comment on column public.student_profiles.social_status_data is
  'Checklist from the paper form: {codes: [orphan|half_orphan|divorced|disability|large_family|ato|zsu|vpo|none], children_count, ato, zsu}.';

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
      'guardian_relation', v_prof.guardian_relation,
      'school_activities', v_prof.school_activities, 'college_plans', v_prof.college_plans,
      'social_status', v_prof.social_status, 'social_status_data', v_prof.social_status_data) end);
end $$;
revoke all on function public.get_questionnaire_data(text) from public, anon, authenticated;
grant execute on function public.get_questionnaire_data(text) to service_role;

create or replace function public.submit_questionnaire(p_token_hash text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_req public.update_requests;
  v_pid uuid;
  v_all text := nullif(btrim(p_payload ->> 'allergies'), '');
  v_chr text := nullif(btrim(p_payload ->> 'chronic_conditions'), '');
  v_social jsonb;
begin
  if coalesce((p_payload ->> 'consent')::boolean, false) is not true then return false; end if;
  select ur.* into v_req
    from public.update_requests ur join public.students s on s.id = ur.student_id
   where ur.token_hash = p_token_hash and ur.used_at is null and ur.expires_at > now() and s.status = 'active'
   for update of ur;
  if not found then return false; end if;

  v_social := jsonb_strip_nulls(jsonb_build_object(
    'codes', coalesce(p_payload -> 'social_codes', '[]'::jsonb),
    'children_count', nullif(btrim(p_payload ->> 'social_children'), ''),
    'ato', nullif(btrim(p_payload ->> 'social_ato'), ''),
    'zsu', nullif(btrim(p_payload ->> 'social_zsu'), '')));

  update public.update_requests set used_at = now() where id = v_req.id;

  insert into public.student_profiles (
    student_id, status, submitted_full_name, submitted_birth_date, submitted_room, group_number, profession,
    class_teacher, master, address, student_phone, mother_name, mother_phone, father_name, father_phone,
    guardian_name, guardian_phone, guardian_relation, school_activities, college_plans, social_status,
    social_status_data, consent_at)
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
    nullif(btrim(p_payload ->> 'guardian_relation'), ''),
    nullif(btrim(p_payload ->> 'school_activities'), ''), nullif(btrim(p_payload ->> 'college_plans'), ''),
    nullif(btrim(p_payload ->> 'social_status'), ''), v_social, now())
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
