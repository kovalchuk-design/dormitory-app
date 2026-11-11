-- approve_student_profile_merged: field-by-field merge of a pending version with the previous one.
-- Single call, ROLLED BACK at the end. Result: one summary row.
begin;
create temp table test_results (n serial primary key, name text, ok boolean, info text);
grant all on test_results to public;
grant usage, select on sequence test_results_n_seq to public;

insert into auth.users (id, aud, role, email) values
  ('e6000000-0000-0000-0000-000000000001','authenticated','authenticated','edu6@test.local'),
  ('e6000000-0000-0000-0000-000000000002','authenticated','authenticated','ro6@test.local');
update public.profiles set role='educator', floor=2, is_active=true where id='e6000000-0000-0000-0000-000000000001';
update public.profiles set role='staff_readonly', is_active=true where id='e6000000-0000-0000-0000-000000000002';
insert into public.students (id, last_name, first_name, grade, birth_date) values
  ('56000000-0000-0000-0000-000000000001','Тест','Злиття',10,'2009-01-01');

-- v1 approved (old data), v2 pending (what the pupil sent now), existing medical + pupil-submitted medical
insert into public.student_profiles (id, student_id, status, approved_at, group_number, address, student_phone, social_status, social_status_data)
values ('76000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001','approved', now(), '8', 'Адреса 1', '+380501111111',
        'Батько зник безвісти', '{"codes":["half_orphan"]}');
insert into public.student_profiles (id, student_id, status, group_number, address, student_phone, social_status, social_status_data)
values ('76000000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000001','pending', '7', 'Адреса 2', '+380502222222',
        'Служба в ЗСУ (Іван)', '{"codes":["zsu"],"zsu":"Іван"}');
insert into public.student_medical (student_id, allergies) values ('56000000-0000-0000-0000-000000000001', 'пилок');
insert into public.student_medical_submissions (profile_id, chronic_conditions) values ('76000000-0000-0000-0000-000000000002', 'астма');

-- negative cases first (as educator)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.approve_student_profile_merged('76000000-0000-0000-0000-000000000002', '{"status":"approved"}'::jsonb);
  exception when others then ok := sqlerrm like 'INVALID%'; end;
  insert into test_results (name, ok) values ('non-editable field (status) is refused', ok);
  ok := false;
  begin perform public.approve_student_profile_merged('76000000-0000-0000-0000-000000000002', jsonb_build_object('address', repeat('я', 2101)));
  exception when others then ok := sqlerrm like 'INVALID%'; end;
  insert into test_results (name, ok) values ('value longer than 2100 is refused', ok);
  ok := false;
  begin perform public.approve_student_profile_merged('76000000-0000-0000-0000-000000000002', '[]'::jsonb);
  exception when others then ok := sqlerrm like 'INVALID%'; end;
  insert into test_results (name, ok) values ('non-object values are refused', ok);
end $$;
reset role;
insert into test_results (name, ok) select 'refused calls changed nothing (v2 still pending, untouched)',
  (select status = 'pending' and address = 'Адреса 2' from public.student_profiles where id = '76000000-0000-0000-0000-000000000002');

-- staff_readonly cannot
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.approve_student_profile_merged('76000000-0000-0000-0000-000000000002', '{}'::jsonb);
  exception when others then ok := sqlerrm like 'FORBIDDEN%'; end;
  insert into test_results (name, ok) values ('staff_readonly cannot approve merged', ok);
end $$;
reset role;

set local role anon;
do $$ declare ok boolean := false; begin
  begin perform public.approve_student_profile_merged(gen_random_uuid(), '{}'::jsonb); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call approve_student_profile_merged', ok);
end $$;
reset role;

-- the real merge: group → new, phone → old, social status → both (old, new), allergies → "old, new", address untouched (new)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.approve_student_profile_merged(
  '76000000-0000-0000-0000-000000000002',
  '{"group_number":"7","student_phone":"+380501111111","social_status":"Батько зник безвісти, Служба в ЗСУ (Іван)","allergies":"пилок, горіхи"}'::jsonb,
  '{"group_number":"new","student_phone":"old","social_status":"both","allergies":"both"}'::jsonb,
  '{"codes":["half_orphan","zsu"],"zsu":"Іван"}'::jsonb);
reset role;

insert into test_results (name, ok) select 'v2 approved by the educator, v1 superseded (kept)',
  (select status = 'approved' and approved_by = 'e6000000-0000-0000-0000-000000000001' from public.student_profiles where id = '76000000-0000-0000-0000-000000000002')
  and (select status = 'superseded' from public.student_profiles where id = '76000000-0000-0000-0000-000000000001');
insert into test_results (name, ok, info) select 'chosen texts are in the approved version (phone from OLD, group from NEW, address untouched)',
  (select student_phone = '+380501111111' and group_number = '7' and address = 'Адреса 2' from public.student_profiles where id = '76000000-0000-0000-0000-000000000002'),
  (select concat_ws('|', student_phone, group_number, address) from public.student_profiles where id = '76000000-0000-0000-0000-000000000002');
insert into test_results (name, ok, info) select 'social status merged "old, new" + structured data union stored',
  (select social_status = 'Батько зник безвісти, Служба в ЗСУ (Іван)' and social_status_data -> 'codes' = '["half_orphan","zsu"]'::jsonb
     from public.student_profiles where id = '76000000-0000-0000-0000-000000000002'),
  (select social_status from public.student_profiles where id = '76000000-0000-0000-0000-000000000002');
insert into test_results (name, ok) select 'review_choices recorded',
  (select review_choices = '{"group_number":"new","student_phone":"old","social_status":"both","allergies":"both"}'::jsonb
     from public.student_profiles where id = '76000000-0000-0000-0000-000000000002');
insert into test_results (name, ok, info) select 'medical: merged allergies written, submitted chronic kept, authorship stamped',
  (select allergies = 'пилок, горіхи' and chronic_conditions = 'астма' and updated_by = 'e6000000-0000-0000-0000-000000000001'
     from public.student_medical where student_id = '56000000-0000-0000-0000-000000000001'),
  (select concat_ws('|', allergies, chronic_conditions) from public.student_medical where student_id = '56000000-0000-0000-0000-000000000001');

-- already processed → NOT_PENDING
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e6000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.approve_student_profile_merged('76000000-0000-0000-0000-000000000002', '{}'::jsonb); exception when others then ok := sqlerrm like 'NOT_PENDING%'; end;
  insert into test_results (name, ok) values ('second approval → NOT_PENDING', ok);
end $$;
reset role;

select jsonb_build_object('passed', count(*) filter (where ok), 'total', count(*),
  'failed', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'info', info) order by n) filter (where not ok), '[]'::jsonb)) as summary
from test_results;
rollback;
