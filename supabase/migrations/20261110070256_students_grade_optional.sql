-- Адміністрація веде групу (student_profiles.group_number), а не клас: students.grade стає необов'язковим.
-- Наявний CHECK (grade between 9 and 11) пропускає NULL, тож лишається як є.
alter table public.students alter column grade drop not null;

create or replace function public.create_student_from_intake(p_submission_id uuid, p_grade int default null)
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
  if p_grade is not null and p_grade not between 9 and 11 then raise exception 'INVALID: grade must be 9..11' using errcode = '22023'; end if;
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
