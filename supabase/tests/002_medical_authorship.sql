-- Medical authorship: created_by / updated_by are stamped by trigger and cannot be spoofed.
-- Single call, ROLLED BACK at the end.
begin;
create temp table test_results (n serial primary key, name text, ok boolean, info text);
grant all on test_results to public;
grant usage, select on sequence test_results_n_seq to public;

insert into auth.users (id, aud, role, email) values
  ('e0000000-0000-0000-0000-000000000002','authenticated','authenticated','e2@test.local'),
  ('e0000000-0000-0000-0000-000000000003','authenticated','authenticated','e3@test.local'),
  ('b0000000-0000-0000-0000-000000000001','authenticated','authenticated','st@test.local');
update public.profiles set role='educator', floor=2, is_active=true where id='e0000000-0000-0000-0000-000000000002';
update public.profiles set role='educator', floor=3, is_active=true where id='e0000000-0000-0000-0000-000000000003';
update public.profiles set role='staff_readonly', is_active=true where id='b0000000-0000-0000-0000-000000000001';
insert into public.students (id, last_name, first_name, grade)
values ('10000000-0000-0000-0000-000000000001','Тест','Учень',10);

-- E2 inserts medical, trying to spoof created_by/updated_by as E3
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
insert into public.student_medical (student_id, allergies, created_by, updated_by)
values ('10000000-0000-0000-0000-000000000001','secretval','e0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003');
reset role;
insert into test_results (name, ok) select 'insert: created_by/updated_by = E2 (spoof ignored)',
  created_by='e0000000-0000-0000-0000-000000000002' and updated_by='e0000000-0000-0000-0000-000000000002'
  from public.student_medical;

-- E3 (other floor) updates, trying to overwrite created_by
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
update public.student_medical set notes='from parents', created_by='e0000000-0000-0000-0000-000000000003';
reset role;
insert into test_results (name, ok) select 'update: created_by stays E2, updated_by = E3',
  created_by='e0000000-0000-0000-0000-000000000002' and updated_by='e0000000-0000-0000-0000-000000000003'
  from public.student_medical;

-- E3 can see who entered it (educators read authorship)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
create temp table seen as select created_by, updated_by from public.student_medical;
reset role;
insert into test_results (name, ok) select 'educator can read created_by/updated_by', count(*)=1 and bool_and(created_by is not null) from seen;

-- staff_readonly sees nothing
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
create temp table seen_staff as select * from public.student_medical;
reset role;
insert into test_results (name, ok) select 'staff_readonly cannot read medical (0 rows)', count(*)=0 from seen_staff;

-- audit: both writers logged, field names only, no values
insert into test_results (name, ok) select 'audit: writers E2 (insert) and E3 (update) recorded, no values stored',
  count(*) filter (where actor_id='e0000000-0000-0000-0000-000000000002' and action='insert') = 1
  and count(*) filter (where actor_id='e0000000-0000-0000-0000-000000000003' and action='update') = 1
  and count(*) filter (where details::text ~* '(secretval|from parents)') = 0
  from public.audit_log where table_name='student_medical';

select count(*) filter (where ok) passed, count(*) filter (where not ok) failed, count(*) total,
  coalesce(string_agg(n||': '||name, E'\n') filter (where not ok), 'no failures') failures from test_results;
rollback;
