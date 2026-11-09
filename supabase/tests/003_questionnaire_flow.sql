-- Questionnaire flow: tokens, public RPCs, approve/reject, medical hold, anon lock-down, rate limit.
-- Single call, everything is ROLLED BACK at the end (no data stays). Result: one row per check.
begin;
create temp table test_results (n serial primary key, name text, ok boolean, info text);
grant all on test_results to public;
grant usage, select on sequence test_results_n_seq to public;
create temp table tok (k text primary key, v text);
grant all on tok to public;

insert into auth.users (id, aud, role, email) values
  ('e1000000-0000-0000-0000-000000000001','authenticated','authenticated','edu@test.local'),
  ('e1000000-0000-0000-0000-000000000002','authenticated','authenticated','ro@test.local');
update public.profiles set role='educator', floor=2, is_active=true where id='e1000000-0000-0000-0000-000000000001';
update public.profiles set role='staff_readonly', is_active=true where id='e1000000-0000-0000-0000-000000000002';
insert into public.students (id, last_name, first_name, grade, birth_date) values
  ('51000000-0000-0000-0000-000000000001','Тест','Активний',10,'2010-05-17'),
  ('51000000-0000-0000-0000-000000000002','Тест','Випускник',11,'2008-01-01');
update public.students set status='graduated' where id='51000000-0000-0000-0000-000000000002';
insert into public.rooms (id, floor, number) values ('61000000-0000-0000-0000-000000000001', 3, 'T305');

-- ---------------------------------------------------------------- educator creates links / places pupil
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.assign_student('51000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','test');
insert into tok select 'valid', public.create_update_request('51000000-0000-0000-0000-000000000001','update',14);
insert into tok select 'expire', public.create_update_request('51000000-0000-0000-0000-000000000001','update',14);
insert into tok select 'revoke', public.create_update_request('51000000-0000-0000-0000-000000000001','update',14);
insert into tok select 'noconsent', public.create_update_request('51000000-0000-0000-0000-000000000001','update',14);
do $$ declare ok boolean := false; begin
  begin perform public.create_update_request('51000000-0000-0000-0000-000000000002','update',14);
  exception when others then ok := sqlerrm like 'STUDENT_NOT_ACTIVE%'; end;
  insert into test_results (name, ok) values ('create link for graduated pupil is refused', ok);
end $$;
reset role;

-- helper: hash exactly like create_update_request
create temp view th as select k, encode(extensions.digest(v,'sha256'),'hex') as h from tok;
grant select on th to public;
-- expire the "expire" link (check: expires_at >= created_at)
update public.update_requests set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
 where token_hash = (select h from th where k='expire');
-- (re)revoke "revoke" through the public function now that order is fixed
-- token_hash is not selectable by API roles, so resolve the request id as the owner first
create temp table revid as select id from public.update_requests where token_hash = (select h from th where k='revoke');
grant select on revid to public;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.revoke_update_request((select id from revid));
reset role;

-- ---------------------------------------------------------------- public RPCs (service_role only)
set local role service_role;
insert into test_results (name, ok) select 'invalid token → get_questionnaire_data is NULL',
  public.get_questionnaire_data(repeat('0',64)) is null;
insert into test_results (name, ok) select 'invalid token → submit_questionnaire is false',
  public.submit_questionnaire(repeat('0',64), '{"consent":true,"full_name":"x y"}'::jsonb) = false;
insert into test_results (name, ok) select 'expired token → get is NULL, submit false',
  public.get_questionnaire_data((select h from th where k='expire')) is null
  and public.submit_questionnaire((select h from th where k='expire'), '{"consent":true,"full_name":"x y"}'::jsonb) = false;
insert into test_results (name, ok) select 'revoked token → get is NULL, submit false',
  public.get_questionnaire_data((select h from th where k='revoke')) is null
  and public.submit_questionnaire((select h from th where k='revoke'), '{"consent":true,"full_name":"x y"}'::jsonb) = false;
insert into test_results (name, ok, info) select 'valid token → get returns name, room, no profile yet',
  d ->> 'full_name' = 'Тест Активний' and d ->> 'room' = 'T305' and d -> 'profile' = 'null'::jsonb, d::text
  from (select public.get_questionnaire_data((select h from th where k='valid')) d) q;
insert into test_results (name, ok) select 'get does not burn the token',
  (select used_at is null from public.update_requests where token_hash = (select h from th where k='valid'));

-- no consent → false and token NOT burned
insert into test_results (name, ok) select 'missing consent → false, token not burned',
  public.submit_questionnaire((select h from th where k='noconsent'), '{"consent":false,"full_name":"Тест Активний"}'::jsonb) = false
  and (select used_at is null from public.update_requests where token_hash = (select h from th where k='noconsent'));

-- valid submit
create temp table payload (j jsonb);
grant all on payload to public;
insert into payload values ('{"consent":true,"full_name":"Тест Активний Іванович","birth_date":"2010-05-17","room":"T305",
  "group_number":"К-21","profession":"Кухар","class_teacher":"Кл. Керівник","master":"Майстер М.","address":"м. Тест, вул. 1",
  "student_phone":"+380671234567","mother_name":"Мама Тест","mother_phone":"+380501234567",
  "allergies":"пилок","chronic_conditions":"","evil":"drop table"}');
insert into test_results (name, ok) select 'valid submit → true',
  public.submit_questionnaire((select h from th where k='valid'), (select j from payload)) = true;
reset role;

insert into test_results (name, ok, info) select 'valid submit created exactly ONE pending version',
  count(*) = 1, count(*)::text from public.student_profiles where student_id='51000000-0000-0000-0000-000000000001' and status='pending';
insert into test_results (name, ok) select 'token marked used + resulting_profile_id set',
  (select used_at is not null and resulting_profile_id = (select id from public.student_profiles where student_id='51000000-0000-0000-0000-000000000001' and status='pending')
   from public.update_requests where token_hash = (select h from th where k='valid'));
insert into test_results (name, ok) select 'pending version has pupil data + consent_at + no approver',
  student_phone='+380671234567' and submitted_full_name='Тест Активний Іванович' and consent_at is not null and approved_by is null and approved_at is null
  from public.student_profiles where student_id='51000000-0000-0000-0000-000000000001' and status='pending';
insert into test_results (name, ok) select 'medical held in submissions (blank field → NULL), NOT yet in student_medical',
  (select count(*) from public.student_medical_submissions where allergies='пилок' and chronic_conditions is null) = 1
  and (select count(*) from public.student_medical) = 0;

set local role service_role;
insert into test_results (name, ok) select 'token used twice → second submit false',
  public.submit_questionnaire((select h from th where k='valid'), (select j from payload)) = false;
insert into test_results (name, ok) select 'used token → get is NULL',
  public.get_questionnaire_data((select h from th where k='valid')) is null;
reset role;
insert into test_results (name, ok) select 'still exactly one pending after replay',
  count(*) = 1 from public.student_profiles where student_id='51000000-0000-0000-0000-000000000001' and status='pending';

-- ---------------------------------------------------------------- rate limit
set local role service_role;
insert into test_results (name, ok) select 'rate limit: 3 hits allowed, 4th refused',
  public.questionnaire_rate_hit('test:k',3,60) and public.questionnaire_rate_hit('test:k',3,60)
  and public.questionnaire_rate_hit('test:k',3,60) and not public.questionnaire_rate_hit('test:k',3,60);
reset role;

-- ---------------------------------------------------------------- anon / authenticated lock-down
set local role anon;
do $$ declare t text; ok boolean; begin
  foreach t in array array['students','student_profiles','student_medical','student_medical_submissions','update_requests',
                           'room_assignments','rooms','profiles','questionnaire_rate_limits','audit_log'] loop
    ok := false;
    begin execute format('select 1 from public.%I limit 1', t);
    exception when insufficient_privilege then ok := true; end;
    insert into test_results (name, ok) values ('anon cannot SELECT public.'||t, ok);
  end loop;
  foreach t in array array['students','student_profiles','update_requests','student_medical_submissions'] loop
    ok := false;
    begin execute format('insert into public.%I default values', t);
    exception when insufficient_privilege then ok := true; when others then ok := false; end;
    insert into test_results (name, ok) values ('anon cannot INSERT into public.'||t, ok);
  end loop;
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.get_questionnaire_data(repeat('0',64)); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call get_questionnaire_data', ok);
  ok := false;
  begin perform public.submit_questionnaire(repeat('0',64), '{}'); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call submit_questionnaire', ok);
  ok := false;
  begin perform public.questionnaire_rate_hit('x',1,1); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call questionnaire_rate_hit', ok);
  ok := false;
  begin perform public.approve_student_profile(gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call approve_student_profile', ok);
  ok := false;
  begin perform public.reject_student_profile(gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call reject_student_profile', ok);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.submit_questionnaire(repeat('0',64), '{}'); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('authenticated educator cannot call submit_questionnaire', ok);
  ok := false;
  begin perform public.get_questionnaire_data(repeat('0',64)); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('authenticated educator cannot call get_questionnaire_data', ok);
  ok := false;
  begin perform 1 from public.questionnaire_rate_limits; exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('authenticated cannot read questionnaire_rate_limits', ok);
  ok := false;
  begin update public.student_profiles set status='approved', approved_at=now() where status='pending'; exception when others then ok := true; end;
  insert into test_results (name, ok) values ('educator cannot self-approve via UPDATE (guard)', ok);
  ok := false;
  begin update public.student_profiles set status='rejected' where status='pending'; exception when others then ok := true; end;
  insert into test_results (name, ok) values ('educator cannot self-reject via UPDATE (guard)', ok);
end $$;
insert into test_results (name, ok) select 'educator sees pending version and held medical', 
  (select count(*) from public.student_profiles where status='pending') = 1
  and (select count(*) from public.student_medical_submissions) = 1;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
insert into test_results (name, ok) select 'staff_readonly cannot see pending versions or medical submissions',
  (select count(*) from public.student_profiles) = 0 and (select count(*) from public.student_medical_submissions) = 0;
do $$ declare ok boolean := false; begin
  begin perform public.approve_student_profile((select id from public.student_profiles limit 1)); exception when others then ok := true; end;
  insert into test_results (name, ok) values ('staff_readonly cannot approve', ok);
  ok := false;
  begin perform public.reject_student_profile(gen_random_uuid()); exception when others then ok := sqlerrm like 'FORBIDDEN%'; end;
  insert into test_results (name, ok) values ('staff_readonly cannot reject', ok);
end $$;
reset role;

-- ---------------------------------------------------------------- approve applies held medical; version history
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.approve_student_profile((select id from public.student_profiles where status='pending'));
reset role;
insert into test_results (name, ok) select 'approve: version approved with approver, medical applied with authorship',
  (select status='approved' and approved_by='e1000000-0000-0000-0000-000000000001' from public.student_profiles where version_no=1 and student_id='51000000-0000-0000-0000-000000000001')
  and (select allergies='пилок' and chronic_conditions is null and updated_by='e1000000-0000-0000-0000-000000000001' from public.student_medical);

-- second round: new link → prefill shows approved data (no medical) → submit → approve supersedes → reject another
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into tok select 'second', public.create_update_request('51000000-0000-0000-0000-000000000001','update',7);
insert into tok select 'third', public.create_update_request('51000000-0000-0000-0000-000000000001','update',7);
reset role;
set local role service_role;
insert into test_results (name, ok, info) select 'prefill returns latest approved data and no medical keys',
  d -> 'profile' ->> 'profession' = 'Кухар' and d ->> 'full_name' = 'Тест Активний Іванович'
  and not (d::text like '%allerg%') and not (d::text like '%chronic%'), d::text
  from (select public.get_questionnaire_data((select h from th where k='second')) d) q;
insert into test_results (name, ok) select 'second submit ok (profession changed)',
  public.submit_questionnaire((select h from th where k='second'), (select j from payload) || '{"profession":"Кондитер","allergies":"","chronic_conditions":""}') = true;
insert into test_results (name, ok) select 'third submit ok',
  public.submit_questionnaire((select h from th where k='third'), (select j from payload) || '{"profession":"Слюсар"}') = true;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.approve_student_profile((select id from public.student_profiles where status='pending' order by version_no limit 1));
select public.reject_student_profile((select id from public.student_profiles where status='pending'));
do $$ declare ok boolean := false; begin
  begin perform public.approve_student_profile((select id from public.student_profiles where status='rejected')); exception when others then ok := sqlerrm like 'NOT_PENDING%'; end;
  insert into test_results (name, ok) values ('approving a rejected version → NOT_PENDING', ok);
  ok := false;
  begin perform public.reject_student_profile((select id from public.student_profiles where status='rejected')); exception when others then ok := sqlerrm like 'NOT_PENDING%'; end;
  insert into test_results (name, ok) values ('rejecting twice → NOT_PENDING', ok);
end $$;
reset role;
insert into test_results (name, ok, info) select 'history: v1 superseded, v2 approved, v3 rejected (by educator), exactly one approved',
  string_agg(status, ',' order by version_no) = 'superseded,approved,rejected'
  and (select count(*) from public.student_profiles where status='approved') = 1
  and (select rejected_by='e1000000-0000-0000-0000-000000000001' and rejected_at is not null and approved_at is null
       from public.student_profiles where status='rejected'), string_agg(status, ',' order by version_no)
  from public.student_profiles where student_id='51000000-0000-0000-0000-000000000001';
insert into test_results (name, ok) select 'blank medical in a later (approved) submission keeps existing student_medical',
  allergies = 'пилок' from public.student_medical;

-- DB-level constraint: approved needs approved_at; rejected must not have it
do $$ declare ok boolean := false; begin
  begin insert into public.student_profiles (student_id, version_no, status) values ('51000000-0000-0000-0000-000000000002', 1, 'approved');
  exception when check_violation then ok := true; end;
  insert into test_results (name, ok) values ('constraint: approved without approved_at is rejected', ok);
  ok := false;
  begin insert into public.student_profiles (student_id, version_no, status) values ('51000000-0000-0000-0000-000000000002', 1, 'bogus');
  exception when check_violation then ok := true; end;
  insert into test_results (name, ok) values ('constraint: unknown status is rejected', ok);
end $$;

select jsonb_build_object('passed', count(*) filter (where ok), 'total', count(*),
  'failed', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'info', info) order by n) filter (where not ok), '[]'::jsonb)) as summary
from test_results;
rollback;
