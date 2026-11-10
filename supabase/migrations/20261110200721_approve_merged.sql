-- Approve a pending questionnaire version with a field-by-field choice made by the educator:
-- for every changed field the educator ticks the OLD value, the NEW value or both (stored as "old, new").
-- The function applies the chosen texts to the pending version, records the choices (review_choices) and then approves it
-- with the unchanged approve_student_profile() (old approved version -> superseded, kept). Medical texts go to student_medical.
alter table public.student_profiles add column review_choices jsonb;
comment on column public.student_profiles.review_choices is
  'How the educator merged this version with the previous one: {field: old|new|both}. NULL = approved as submitted.';

create or replace function public.approve_student_profile_merged(
  p_profile_id uuid, p_values jsonb, p_choices jsonb default '{}'::jsonb, p_social_data jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row public.student_profiles;
  k text;
  v text;
  v_text_cols text[] := array['submitted_full_name', 'submitted_room', 'group_number', 'profession', 'class_teacher', 'master',
    'address', 'student_phone', 'mother_name', 'mother_phone', 'father_name', 'father_phone', 'guardian_name', 'guardian_phone',
    'guardian_relation', 'school_activities', 'college_plans', 'social_status'];
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
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'INVALID: p_values must be an object' using errcode = '22023';
  end if;

  for k, v in select e.key, e.value from jsonb_each_text(p_values) e loop
    if length(coalesce(v, '')) > 2100 then
      raise exception 'INVALID: value of % is too long', k using errcode = '22023';
    end if;
    if k = any (v_text_cols) then
      execute format('update public.student_profiles set %I = nullif(btrim($1), '''') where id = $2', k) using v, p_profile_id;
    elsif k = 'submitted_birth_date' then
      update public.student_profiles set submitted_birth_date = nullif(btrim(v), '')::date where id = p_profile_id;
    elsif k not in ('allergies', 'chronic_conditions') then
      raise exception 'INVALID: field % cannot be edited', k using errcode = '22023';
    end if;
  end loop;
  if p_social_data is not null then
    update public.student_profiles set social_status_data = p_social_data where id = p_profile_id;
  end if;
  update public.student_profiles set review_choices = nullif(p_choices, '{}'::jsonb) where id = p_profile_id;

  perform public.approve_student_profile(p_profile_id);

  -- merged medical texts replace whatever approve_student_profile() applied from the pupil's submission
  if jsonb_exists(p_values, 'allergies') or jsonb_exists(p_values, 'chronic_conditions') then
    insert into public.student_medical as m (student_id, allergies, chronic_conditions)
    values (v_row.student_id, nullif(btrim(p_values ->> 'allergies'), ''), nullif(btrim(p_values ->> 'chronic_conditions'), ''))
    on conflict (student_id) do update
      set allergies = case when jsonb_exists(p_values, 'allergies') then excluded.allergies else m.allergies end,
          chronic_conditions = case when jsonb_exists(p_values, 'chronic_conditions') then excluded.chronic_conditions else m.chronic_conditions end;
  end if;
end $$;
revoke all on function public.approve_student_profile_merged(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.approve_student_profile_merged(uuid, jsonb, jsonb, jsonb) to authenticated;
