-- Security / RLS / function tests for the dormitory database.
-- Run in ONE call; everything happens in a transaction that is ROLLED BACK at the end,
-- so no data persists. Result: one row per test (ok = true/false).
-- Roles are simulated with: set local role authenticated|anon + request.jwt.claims.

begin;

create temp table test_results (n serial primary key, name text, ok boolean, info text);
create temp table kv  (k text primary key, v text);
create temp table ids (k text primary key, val text);
grant all on test_results, kv, ids to public;
grant usage, select on sequence test_results_n_seq to public;

insert into ids values
 ('A','a0000000-0000-0000-0000-000000000001'),  -- admin
 ('E2','e0000000-0000-0000-0000-000000000002'), -- educator floor 2
 ('E3','e0000000-0000-0000-0000-000000000003'), -- educator floor 3
 ('E4','e0000000-0000-0000-0000-000000000004'), -- educator floor 2, INACTIVE
 ('ST','b0000000-0000-0000-0000-000000000001'), -- staff_readonly
 ('NEW','c0000000-0000-0000-0000-000000000001'),-- freshly signed-up user
 ('S1','10000000-0000-0000-0000-000000000001'),
 ('S2','10000000-0000-0000-0000-000000000002'),
 ('S3','10000000-0000-0000-0000-000000000003'),
 ('S4','10000000-0000-0000-0000-000000000004'),
 ('S5','10000000-0000-0000-0000-000000000005'), -- status left
 ('R201','20000000-0000-0000-0000-000000000201'),
 ('R202','20000000-0000-0000-0000-000000000202'),
 ('R301','20000000-0000-0000-0000-000000000301'),
 ('R501','20000000-0000-0000-0000-000000000501'),
 ('R502','20000000-0000-0000-0000-000000000502'),
 ('Y1','30000000-0000-0000-0000-000000000001'),
 ('Y2','30000000-0000-0000-0000-000000000002');

-- ------------------------------------------------------------ test helpers
create function pg_temp.x(p text) returns text language plpgsql as $f$
declare r record; o text := p;
begin
  for r in select k, val from ids loop o := replace(o, '{' || r.k || '}', r.val); end loop;
  return o;
end $f$;

create function pg_temp.run_as(p_user text) returns void language plpgsql as $f$
begin
  reset role;
  if p_user = 'postgres' then return; end if;
  if p_user = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', pg_temp.x(p_user), 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end $f$;

-- expect: ok | rows:N | state:XXXXX | msg:TEXT | deny (42501 or 0 rows)
create function pg_temp.t(p_name text, p_user text, p_sql text, p_expect text) returns void language plpgsql as $f$
declare v_rows int; v_state text; v_msg text; v_ok boolean; v_sql text := pg_temp.x(p_sql);
begin
  perform pg_temp.run_as(p_user);
  begin
    execute v_sql;
    get diagnostics v_rows = row_count;
  exception when others then
    v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  v_ok := case
    when p_expect = 'ok'       then v_state is null
    when p_expect = 'deny'     then v_state = '42501' or (v_state is null and v_rows = 0)
    when p_expect like 'rows:%'  then v_state is null and v_rows = substr(p_expect, 6)::int
    when p_expect like 'state:%' then v_state = substr(p_expect, 7)
    when p_expect like 'msg:%'   then v_state is not null and v_msg like '%' || substr(p_expect, 5) || '%'
  end;
  insert into test_results (name, ok, info)
  values (p_name, coalesce(v_ok, false),
          format('expect=%s | state=%s rows=%s msg=%s', p_expect, v_state, v_rows, left(v_msg, 100)));
end $f$;

create function pg_temp.chk(p_name text, p_cond boolean, p_info text default '') returns void language plpgsql as $f$
begin
  reset role;
  insert into test_results (name, ok, info) values (p_name, coalesce(p_cond, false), p_info);
end $f$;

-- ------------------------------------------------------------------ setup (as postgres)
insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001','authenticated','authenticated','admin@test.local'),
  ('e0000000-0000-0000-0000-000000000002','authenticated','authenticated','e2@test.local'),
  ('e0000000-0000-0000-0000-000000000003','authenticated','authenticated','e3@test.local'),
  ('e0000000-0000-0000-0000-000000000004','authenticated','authenticated','e4@test.local'),
  ('b0000000-0000-0000-0000-000000000001','authenticated','authenticated','staff@test.local'),
  ('c0000000-0000-0000-0000-000000000001','authenticated','authenticated','new@test.local');

select pg_temp.chk('signup trigger: new user gets inactive staff_readonly profile without floor',
  (select role = 'staff_readonly' and is_active = false and floor is null
     from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.chk('signup trigger: one profile per auth user (6)', (select count(*) = 6 from public.profiles));

update public.profiles set role='admin',    is_active=true, full_name='Admin'  where id='a0000000-0000-0000-0000-000000000001';
update public.profiles set role='educator', floor=2, is_active=true, full_name='Edu 2' where id='e0000000-0000-0000-0000-000000000002';
update public.profiles set role='educator', floor=3, is_active=true, full_name='Edu 3' where id='e0000000-0000-0000-0000-000000000003';
update public.profiles set role='educator', floor=2, is_active=false, full_name='Edu 4' where id='e0000000-0000-0000-0000-000000000004';
update public.profiles set role='staff_readonly', is_active=true, full_name='Staff' where id='b0000000-0000-0000-0000-000000000001';

insert into public.academic_years (id, name, start_date, end_date, is_current)
values ('30000000-0000-0000-0000-000000000001', '2026/2027', '2026-09-01', '2027-06-30', true);

insert into public.students (id, last_name, first_name, grade, status, academic_year_id) values
 ('10000000-0000-0000-0000-000000000001','Іваненко','Іван',10,'active','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','Петренко','Петро',10,'active','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','Сидоренко','Сидір',11,'active','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000004','Коваль','Олег',9,'active','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000005','Шевчук','Тарас',11,'left','30000000-0000-0000-0000-000000000001');

insert into public.rooms (id, floor, number, capacity, is_active) values
 ('20000000-0000-0000-0000-000000000201', 2, '201', 2, true),
 ('20000000-0000-0000-0000-000000000202', 2, '202', 4, true),
 ('20000000-0000-0000-0000-000000000301', 3, '301', 4, true),
 ('20000000-0000-0000-0000-000000000501', 5, '501', 4, true),
 ('20000000-0000-0000-0000-000000000502', 5, '502', 4, false);

insert into public.room_assignments (student_id, room_id, from_date, to_date) values
 ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000201','2026-01-01','2026-03-01'); -- closed history
insert into public.room_assignments (student_id, room_id) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000201'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000201'),
 ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000301');

insert into public.student_medical (student_id, allergies) values
 ('10000000-0000-0000-0000-000000000001','peanut'),
 ('10000000-0000-0000-0000-000000000003','pollen');

insert into public.student_profiles (student_id, status, approved_by, approved_at, student_phone) values
 ('10000000-0000-0000-0000-000000000001','approved','a0000000-0000-0000-0000-000000000001', now(), '+380000000001');
insert into public.student_profiles (student_id, status, student_phone) values
 ('10000000-0000-0000-0000-000000000001','pending','+380000000002'),
 ('10000000-0000-0000-0000-000000000003','pending','+380000000003');

insert into public.event_quotas (educator_id, academic_year_id, required_count) values
 ('e0000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',10),
 ('e0000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',8);
insert into public.event_plan (planned_date, title) values ('2026-10-01', 'План 1');
insert into public.documents (title, storage_path, author_id) values
 ('Doc A', 'a.pdf', 'a0000000-0000-0000-0000-000000000001');

-- ===================================================== 1. anon reads / does nothing
select pg_temp.t('anon cannot read ' || t, 'anon', 'select 1 from public.' || t, 'state:42501')
from unnest(array['profiles','academic_years','students','student_profiles','student_medical','rooms',
  'room_assignments','update_requests','audit_log','event_quotas','event_sessions','event_attendance',
  'event_plan','documents','document_templates','v_room_occupancy']) as t;
select pg_temp.t('anon cannot write students', 'anon', $q$insert into public.students (last_name, first_name, grade) values ('x','y',9)$q$, 'state:42501');
select pg_temp.t('anon cannot call move_student', 'anon', $q$select public.move_student('{S1}','{R202}','x')$q$, 'state:42501');
select pg_temp.t('anon cannot call create_update_request', 'anon', $q$select public.create_update_request('{S1}','update',7)$q$, 'state:42501');
select pg_temp.t('anon cannot call approve_student_profile', 'anon', $q$select public.approve_student_profile(gen_random_uuid())$q$, 'state:42501');
select pg_temp.t('anon cannot call admin_set_profile', 'anon', $q$select public.admin_set_profile('{E2}','admin',null,true)$q$, 'state:42501');
select pg_temp.t('anon cannot use private helpers', 'anon', $q$select private.is_admin()$q$, 'state:42501');
select pg_temp.t('anon sees no storage objects', 'anon', $q$select 1 from storage.objects$q$, 'deny');

-- ===================================================== 2. inactive / unactivated users
select pg_temp.t('inactive new user sees no students', '{NEW}', 'select 1 from public.students', 'rows:0');
select pg_temp.t('inactive new user sees only own profile', '{NEW}', 'select 1 from public.profiles', 'rows:1');
select pg_temp.t('inactive new user cannot self-activate', '{NEW}', $q$update public.profiles set is_active = true where id = '{NEW}'$q$, 'state:42501');
select pg_temp.t('inactive new user cannot self-assign admin role', '{NEW}', $q$update public.profiles set role = 'admin' where id = '{NEW}'$q$, 'state:42501');
select pg_temp.t('inactive new user cannot set floor', '{NEW}', $q$update public.profiles set floor = 2 where id = '{NEW}'$q$, 'state:42501');
select pg_temp.t('inactive new user cannot insert own profile', '{NEW}', $q$insert into public.profiles (id, role, is_active) values (gen_random_uuid(),'admin',true)$q$, 'state:42501');
select pg_temp.t('inactive educator (E4) sees no students', '{E4}', 'select 1 from public.students', 'rows:0');
select pg_temp.t('inactive educator (E4) sees no medical', '{E4}', 'select 1 from public.student_medical', 'rows:0');
select pg_temp.t('inactive educator (E4) cannot move_student', '{E4}', $q$select public.move_student('{S1}','{R202}','x')$q$, 'msg:FORBIDDEN');
select pg_temp.t('inactive educator (E4) cannot read documents', '{E4}', 'select 1 from public.documents', 'rows:0');

-- ===================================================== 3. staff_readonly
select pg_temp.t('staff reads all pupils', '{ST}', 'select 1 from public.students', 'rows:5');
select pg_temp.t('staff cannot read student_medical', '{ST}', 'select 1 from public.student_medical', 'rows:0');
select pg_temp.t('staff sees only approved questionnaire versions', '{ST}', 'select 1 from public.student_profiles', 'rows:1');
select pg_temp.t('staff sees only open room assignments (no history)', '{ST}', 'select 1 from public.room_assignments where to_date is not null', 'rows:0');
select pg_temp.t('staff sees open room assignments', '{ST}', 'select 1 from public.room_assignments where to_date is null', 'rows:3');
select pg_temp.t('staff reads rooms', '{ST}', 'select 1 from public.rooms', 'rows:5');
select pg_temp.t('staff reads v_room_occupancy', '{ST}', 'select 1 from public.v_room_occupancy', 'rows:5');
select pg_temp.t('staff cannot update students', '{ST}', $q$update public.students set grade = 11 where id = '{S1}'$q$, 'rows:0');
select pg_temp.t('staff cannot insert students', '{ST}', $q$insert into public.students (last_name, first_name, grade) values ('x','y',9)$q$, 'state:42501');
select pg_temp.t('staff cannot delete students', '{ST}', $q$delete from public.students where id = '{S1}'$q$, 'rows:0');
select pg_temp.t('staff cannot insert medical', '{ST}', $q$insert into public.student_medical (student_id, allergies) values ('{S2}','x')$q$, 'state:42501');
select pg_temp.t('staff cannot update medical', '{ST}', $q$update public.student_medical set allergies='x'$q$, 'rows:0');
select pg_temp.t('staff cannot insert questionnaire', '{ST}', $q$insert into public.student_profiles (student_id) values ('{S2}')$q$, 'state:42501');
select pg_temp.t('staff cannot insert rooms', '{ST}', $q$insert into public.rooms (floor, number) values (2,'299')$q$, 'state:42501');
select pg_temp.t('staff cannot update rooms', '{ST}', $q$update public.rooms set capacity = 3$q$, 'rows:0');
select pg_temp.t('staff cannot write room_assignments directly', '{ST}', $q$insert into public.room_assignments (student_id, room_id) values ('{S4}','{R202}')$q$, 'state:42501');
select pg_temp.t('staff cannot move_student', '{ST}', $q$select public.move_student('{S1}','{R202}','x')$q$, 'msg:FORBIDDEN');
select pg_temp.t('staff cannot assign_student', '{ST}', $q$select public.assign_student('{S4}','{R202}','x')$q$, 'msg:FORBIDDEN');
select pg_temp.t('staff cannot create_update_request', '{ST}', $q$select public.create_update_request('{S1}','update',7)$q$, 'msg:FORBIDDEN');
select pg_temp.t('staff cannot approve questionnaire', '{ST}', $q$select public.approve_student_profile(id) from public.student_profiles limit 1$q$, 'msg:FORBIDDEN');
select pg_temp.t('staff cannot read audit_log', '{ST}', 'select 1 from public.audit_log', 'rows:0');
select pg_temp.t('staff cannot read update_requests', '{ST}', 'select id from public.update_requests', 'rows:0');
select pg_temp.t('staff cannot read event_sessions', '{ST}', 'select 1 from public.event_sessions', 'rows:0');
select pg_temp.t('staff cannot read event_plan', '{ST}', 'select 1 from public.event_plan', 'rows:0');
select pg_temp.t('staff cannot read event_quotas', '{ST}', 'select 1 from public.event_quotas', 'rows:0');
select pg_temp.t('staff can read documents', '{ST}', 'select 1 from public.documents', 'rows:1');
select pg_temp.t('staff cannot insert documents', '{ST}', $q$insert into public.documents (title, storage_path, author_id) values ('x','x.pdf','{ST}')$q$, 'state:42501');
select pg_temp.t('staff cannot insert academic_years', '{ST}', $q$insert into public.academic_years (name,start_date,end_date) values ('z','2030-09-01','2031-06-30')$q$, 'state:42501');
select pg_temp.t('staff can edit own full_name', '{ST}', $q$update public.profiles set full_name='Staff X' where id='{ST}'$q$, 'rows:1');
select pg_temp.t('staff cannot edit others full_name', '{ST}', $q$update public.profiles set full_name='hack' where id='{E2}'$q$, 'rows:0');

-- ===================================================== 4. educator (floor 2) scope
select pg_temp.t('E2 reads all pupils', '{E2}', 'select 1 from public.students', 'rows:5');
select pg_temp.t('E2 edits pupil on own floor (S1)', '{E2}', $q$update public.students set grade = 11 where id = '{S1}'$q$, 'rows:1');
select pg_temp.t('E2 cannot edit pupil on floor 3 (S3)', '{E2}', $q$update public.students set grade = 9 where id = '{S3}'$q$, 'rows:0');
select pg_temp.t('E2 can edit unplaced pupil (S4) [by design]', '{E2}', $q$update public.students set grade = 10 where id = '{S4}'$q$, 'rows:1');
select pg_temp.t('E2 can create a pupil', '{E2}', $q$insert into public.students (last_name, first_name, grade) values ('Новий','Учень',9)$q$, 'ok');
select pg_temp.t('E2 cannot delete pupils', '{E2}', $q$delete from public.students where id = '{S1}'$q$, 'rows:0');
select pg_temp.t('E2 reads all medical (spec: educators read)', '{E2}', 'select 1 from public.student_medical', 'rows:2');
select pg_temp.t('E2 edits medical of own-floor pupil (S1)', '{E2}', $q$update public.student_medical set notes = 'note' where student_id = '{S1}'$q$, 'rows:1');
select pg_temp.t('E2 cannot edit medical of floor-3 pupil (S3)', '{E2}', $q$update public.student_medical set notes = 'x' where student_id = '{S3}'$q$, 'rows:0');
select pg_temp.t('E2 cannot insert medical for floor-3 pupil', '{E2}', $q$insert into public.student_medical (student_id) values ('{S3}')$q$, 'state:42501');
select pg_temp.t('E2 cannot delete medical', '{E2}', $q$delete from public.student_medical$q$, 'rows:0');
select pg_temp.t('E2 edits pending questionnaire of own-floor pupil', '{E2}', $q$update public.student_profiles set address = 'вул. Тестова' where student_id = '{S1}' and status = 'pending'$q$, 'rows:1');
select pg_temp.t('E2 cannot edit approved questionnaire', '{E2}', $q$update public.student_profiles set address = 'x' where student_id = '{S1}' and status = 'approved'$q$, 'rows:0');
select pg_temp.t('E2 cannot edit questionnaire of floor-3 pupil', '{E2}', $q$update public.student_profiles set address = 'x' where student_id = '{S3}'$q$, 'rows:0');
select pg_temp.t('E2 cannot insert questionnaire as approved', '{E2}', $q$insert into public.student_profiles (student_id, status, approved_at) values ('{S1}','approved',now())$q$, 'state:42501');
select pg_temp.t('E2 cannot flip status directly', '{E2}', $q$update public.student_profiles set status='approved', approved_at=now() where student_id='{S1}' and status='pending'$q$, 'state:42501');
select pg_temp.t('E2 can add pending questionnaire for own-floor pupil', '{E2}', $q$insert into public.student_profiles (student_id, status, student_phone) values ('{S1}','pending','+3801')$q$, 'ok');
select pg_temp.t('E2 cannot add questionnaire for floor-3 pupil', '{E2}', $q$insert into public.student_profiles (student_id) values ('{S3}')$q$, 'state:42501');
select pg_temp.t('E2 cannot delete questionnaire versions', '{E2}', $q$delete from public.student_profiles$q$, 'rows:0');
select pg_temp.t('E2 changes capacity of own-floor room (202)', '{E2}', $q$update public.rooms set capacity = 3 where id = '{R202}'$q$, 'rows:1');
select pg_temp.t('E2 cannot change capacity of floor-3 room', '{E2}', $q$update public.rooms set capacity = 3 where id = '{R301}'$q$, 'rows:0');
select pg_temp.t('E2 cannot rename room', '{E2}', $q$update public.rooms set number = '999' where id = '{R202}'$q$, 'state:42501');
select pg_temp.t('E2 cannot move room to another floor', '{E2}', $q$update public.rooms set floor = 3 where id = '{R202}'$q$, 'state:42501');
select pg_temp.t('E2 cannot deactivate room', '{E2}', $q$update public.rooms set is_active = false where id = '{R202}'$q$, 'state:42501');
select pg_temp.t('E2 cannot lower capacity below occupancy', '{E2}', $q$update public.rooms set capacity = 1 where id = '{R201}'$q$, 'state:23514');
select pg_temp.t('E2 cannot create/delete rooms', '{E2}', $q$insert into public.rooms (floor, number) values (2,'298')$q$, 'state:42501');
select pg_temp.t('E2 cannot delete rooms', '{E2}', $q$delete from public.rooms where id = '{R202}'$q$, 'rows:0');
select pg_temp.t('E2 cannot insert room_assignments directly', '{E2}', $q$insert into public.room_assignments (student_id, room_id) values ('{S4}','{R202}')$q$, 'state:42501');
select pg_temp.t('E2 cannot update room_assignments directly', '{E2}', $q$update public.room_assignments set to_date = current_date$q$, 'state:42501');
select pg_temp.t('E2 cannot delete room history', '{E2}', $q$delete from public.room_assignments$q$, 'rows:0');
select pg_temp.t('E2 reads full room history', '{E2}', 'select 1 from public.room_assignments where to_date is not null', 'rows:1');
select pg_temp.t('E2 cannot read audit_log', '{E2}', 'select 1 from public.audit_log', 'rows:0');
select pg_temp.t('E2 cannot create academic year', '{E2}', $q$insert into public.academic_years (name,start_date,end_date) values ('z','2030-09-01','2031-06-30')$q$, 'state:42501');

-- escalation attempts
select pg_temp.t('ESC: educator cannot change own role', '{E2}', $q$update public.profiles set role='admin' where id='{E2}'$q$, 'state:42501');
select pg_temp.t('ESC: educator cannot change own floor', '{E2}', $q$update public.profiles set floor=3 where id='{E2}'$q$, 'state:42501');
select pg_temp.t('ESC: educator cannot change own is_active', '{E2}', $q$update public.profiles set is_active=false where id='{E2}'$q$, 'state:42501');
select pg_temp.t('ESC: educator cannot change own id', '{E2}', $q$update public.profiles set id=gen_random_uuid() where id='{E2}'$q$, 'state:42501');
select pg_temp.t('ESC: educator cannot promote someone else', '{E2}', $q$update public.profiles set role='admin' where id='{ST}'$q$, 'state:42501');
select pg_temp.t('ESC: educator cannot edit others full_name', '{E2}', $q$update public.profiles set full_name='x' where id='{E3}'$q$, 'rows:0');
select pg_temp.t('ESC: educator cannot call admin_set_profile on self', '{E2}', $q$select public.admin_set_profile('{E2}','admin',null,true)$q$, 'msg:admin only');
select pg_temp.t('ESC: educator cannot call admin_set_profile on others', '{E2}', $q$select public.admin_set_profile('{ST}','admin',null,true)$q$, 'msg:admin only');
select pg_temp.t('ESC: staff cannot call admin_set_profile', '{ST}', $q$select public.admin_set_profile('{ST}','admin',null,true)$q$, 'msg:admin only');
select pg_temp.t('ESC: educator cannot delete profiles', '{E2}', $q$delete from public.profiles where id='{E3}'$q$, 'state:42501');
select pg_temp.t('admin cannot change own role via admin_set_profile', '{A}', $q$select public.admin_set_profile('{A}','educator',2,true)$q$, 'msg:own role');
select pg_temp.t('admin cannot directly update role column either (must use function)', '{A}', $q$update public.profiles set role='staff_readonly' where id='{ST}'$q$, 'state:42501');
select pg_temp.t('admin: educator without floor rejected', '{A}', $q$select public.admin_set_profile('{E4}','educator',null,true)$q$, 'msg:needs a floor');
select pg_temp.t('admin activates E4 via admin_set_profile', '{A}', $q$select public.admin_set_profile('{E4}','educator',2,true)$q$, 'ok');
select pg_temp.t('activated E4 now reads pupils', '{E4}', 'select 1 from public.students', 'rows:6');

-- ===================================================== 6. approve_student_profile (before moves: S1 is on floor 2)
select pg_temp.t('approve: educator of another floor (E3) refused', '{E3}',
  $q$select public.approve_student_profile((select id from public.student_profiles where student_id='{S1}' and version_no=2))$q$, 'msg:FORBIDDEN');
select pg_temp.t('approve: E2 approves pending v2 of S1', '{E2}',
  $q$select public.approve_student_profile((select id from public.student_profiles where student_id='{S1}' and version_no=2))$q$, 'ok');
select pg_temp.chk('approve: exactly one approved version, it is v2',
  (select count(*) = 1 and max(version_no) = 2 from public.student_profiles where student_id='10000000-0000-0000-0000-000000000001' and status='approved'));
select pg_temp.chk('approve: previous approved version kept as superseded',
  (select status = 'superseded' from public.student_profiles where student_id='10000000-0000-0000-0000-000000000001' and version_no=1));
select pg_temp.chk('approve: approved_by/approved_at set',
  (select approved_by = 'e0000000-0000-0000-0000-000000000002' and approved_at is not null from public.student_profiles where student_id='10000000-0000-0000-0000-000000000001' and version_no=2));
select pg_temp.t('approve: re-approving an approved version fails', '{E2}',
  $q$select public.approve_student_profile((select id from public.student_profiles where student_id='{S1}' and version_no=2))$q$, 'msg:NOT_PENDING');
select pg_temp.t('approve: E2 approves pending v3 of S1', '{E2}',
  $q$select public.approve_student_profile((select id from public.student_profiles where student_id='{S1}' and version_no=3))$q$, 'ok');
select pg_temp.chk('approve: still exactly one approved (v3); v1,v2 superseded; 3 versions kept',
  (select count(*) filter (where status='approved') = 1
      and count(*) filter (where status='approved' and version_no=3) = 1
      and count(*) filter (where status='superseded') = 2
      and count(*) = 3
     from public.student_profiles where student_id='10000000-0000-0000-0000-000000000001'));
select pg_temp.t('approve: DB refuses a second approved row (partial unique index)', 'postgres',
  $q$insert into public.student_profiles (student_id, status, approved_at) values ('{S1}','approved',now())$q$, 'state:23505');
select pg_temp.t('approve: admin cannot bypass via direct status update', '{A}',
  $q$update public.student_profiles set status='approved', approved_at=now() where student_id='{S1}' and version_no=1$q$, 'state:42501');
select pg_temp.t('approve: staff sees exactly the one approved version', '{ST}', 'select 1 from public.student_profiles', 'rows:1');
select pg_temp.t('approve: unknown id', '{A}', $q$select public.approve_student_profile(gen_random_uuid())$q$, 'msg:NOT_FOUND');

-- ===================================================== 5. move_student / assign_student
select pg_temp.t('move: refuses full target room (R201 2/2)', '{E2}', $q$select public.move_student('{S3}','{R201}','test')$q$, 'msg:ROOM_FULL');
select pg_temp.t('assign: refuses duplicate placement', '{E2}', $q$select public.assign_student('{S1}','{R202}','test')$q$, 'msg:ALREADY_PLACED');
select pg_temp.t('move: refuses move into the same room', '{E2}', $q$select public.move_student('{S1}','{R201}','test')$q$, 'msg:ALREADY_IN_ROOM');
select pg_temp.t('move: refuses unplaced pupil (use assign)', '{E2}', $q$select public.move_student('{S4}','{R202}','test')$q$, 'msg:NOT_PLACED');
select pg_temp.t('move: educator refused when neither room is on own floor', '{E2}', $q$select public.move_student('{S3}','{R501}','test')$q$, 'msg:FORBIDDEN');
select pg_temp.t('assign: educator refused for room on another floor', '{E2}', $q$select public.assign_student('{S4}','{R301}','test')$q$, 'msg:FORBIDDEN');
select pg_temp.t('assign: E2 places unplaced S4 into R202', '{E2}', $q$select public.assign_student('{S4}','{R202}','first placement')$q$, 'ok');
select pg_temp.t('assign: refuses pupil with status left', '{A}', $q$select public.assign_student('{S5}','{R202}','x')$q$, 'msg:STUDENT_NOT_ACTIVE');
select pg_temp.t('move: refuses inactive room', '{A}', $q$select public.move_student('{S2}','{R502}','x')$q$, 'msg:ROOM_INACTIVE');
select pg_temp.t('move: unknown room', '{A}', $q$select public.move_student('{S2}',gen_random_uuid(),'x')$q$, 'msg:NOT_FOUND');
select pg_temp.t('move: E3 (floor 3) cannot move between two floor-2 rooms', '{E3}', $q$select public.move_student('{S2}','{R202}','x')$q$, 'msg:FORBIDDEN');
select pg_temp.t('move: E2 moves S1 R201 -> R301 (source on own floor)', '{E2}', $q$select public.move_student('{S1}','{R301}','переселення')$q$, 'ok');
select pg_temp.chk('move: old assignment closed today, new one open, reason stored',
  (select count(*) filter (where room_id='20000000-0000-0000-0000-000000000201' and to_date = (now() at time zone 'Europe/Kyiv')::date) = 1
      and count(*) filter (where room_id='20000000-0000-0000-0000-000000000301' and to_date is null and reason='переселення'
                           and moved_by='e0000000-0000-0000-0000-000000000002') = 1
     from public.room_assignments where student_id='10000000-0000-0000-0000-000000000001'));
select pg_temp.t('move: DB refuses a 2nd open assignment for a pupil (partial unique index)', 'postgres',
  $q$insert into public.room_assignments (student_id, room_id) values ('{S1}','{R202}')$q$, 'state:23505');
select pg_temp.t('move: E3 moves S1 back R301 -> R201 (source on own floor)', '{E3}', $q$select public.move_student('{S1}','{R201}','назад')$q$, 'ok');
select pg_temp.chk('move: full history kept (3 rows for S1), exactly one open',
  (select count(*) = 3 and count(*) filter (where to_date is null) = 1 from public.room_assignments where student_id='10000000-0000-0000-0000-000000000001'));
select pg_temp.chk('v_room_occupancy: R201 2/2 free 0; R301 1/4 free 3; R202 1/3 free 2',
  (select bool_and(case room when '201' then occupied=2 and free=0
                           when '301' then occupied=1 and free=3
                           when '202' then occupied=1 and free=2 else true end)
     from public.v_room_occupancy));
select pg_temp.chk('v_room_occupancy never shows negative free', (select bool_and(free >= 0) from public.v_room_occupancy));
select pg_temp.t('deactivating a room with residents is refused', '{A}', $q$update public.rooms set is_active=false where id='{R201}'$q$, 'state:23514');

-- ===================================================== 7. update_requests (one-time links)
select pg_temp.t('link: E2 creates link for own-floor pupil (S4)', '{E2}', $q$insert into kv select 'tok', public.create_update_request('{S4}','annual',14)$q$, 'ok');
insert into ids select 'REQ', id::text from public.update_requests;
select pg_temp.chk('link: raw token is 64 hex chars', (select v ~ '^[0-9a-f]{64}$' from kv where k='tok'));
select pg_temp.chk('link: raw token is NOT stored anywhere in update_requests',
  (select count(*) = 0 from public.update_requests where token_hash = (select v from kv where k='tok')));
select pg_temp.chk('link: stored hash = sha256(token), unused, expires in ~14 days',
  (select count(*) = 1 from public.update_requests
    where token_hash = encode(extensions.digest((select v from kv where k='tok'), 'sha256'), 'hex')
      and used_at is null and kind = 'annual'
      and expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'));
select pg_temp.t('link: E2 cannot read token_hash column', '{E2}', 'select token_hash from public.update_requests', 'state:42501');
select pg_temp.t('link: E2 cannot select * (hash column denied)', '{E2}', 'select * from public.update_requests', 'state:42501');
select pg_temp.t('link: E2 can read link metadata for own floor', '{E2}', 'select id, expires_at, used_at from public.update_requests', 'rows:1');
select pg_temp.t('link: E3 cannot see link of floor-2 pupil', '{E3}', 'select id from public.update_requests', 'rows:0');
select pg_temp.t('link: E3 cannot create link for floor-2 pupil', '{E3}', $q$select public.create_update_request('{S4}','update',7)$q$, 'msg:FORBIDDEN');
select pg_temp.t('link: invalid ttl rejected', '{E2}', $q$select public.create_update_request('{S4}','update',0)$q$, 'msg:INVALID');
select pg_temp.t('link: invalid kind rejected', '{E2}', $q$select public.create_update_request('{S4}','weird',7)$q$, 'msg:INVALID');
select pg_temp.t('link: pupil with status left rejected', '{A}', $q$select public.create_update_request('{S5}','update',7)$q$, 'msg:STUDENT_NOT_ACTIVE');
select pg_temp.t('link: API users cannot insert directly', '{E2}', $q$insert into public.update_requests (student_id, token_hash, kind, expires_at) values ('{S4}','h','update',now()+interval '1 day')$q$, 'state:42501');
select pg_temp.t('link: API users cannot mark link used', '{E2}', $q$update public.update_requests set used_at = now()$q$, 'state:42501');
select pg_temp.t('link: E3 cannot revoke link of floor-2 pupil', '{E3}', $q$select public.revoke_update_request('{REQ}'::uuid)$q$, 'msg:FORBIDDEN');
select pg_temp.t('link: E2 revokes link', '{E2}', $q$select public.revoke_update_request('{REQ}'::uuid)$q$, 'ok');
select pg_temp.chk('link: revoked link is expired (expires_at <= now)', (select expires_at <= now() from public.update_requests limit 1));

-- ===================================================== 8. audit_log
select pg_temp.t('audit: admin can read audit_log', '{A}', 'select 1 from public.audit_log', 'ok');
select pg_temp.chk('audit: admin sees entries', (select count(*) > 0 from public.audit_log));
select pg_temp.t('audit: educator reads nothing', '{E2}', 'select 1 from public.audit_log', 'rows:0');
select pg_temp.t('audit: admin cannot insert', '{A}', $q$insert into public.audit_log (action, table_name) values ('insert','x')$q$, 'state:42501');
select pg_temp.t('audit: admin cannot update', '{A}', $q$update public.audit_log set action='delete'$q$, 'state:42501');
select pg_temp.t('audit: admin cannot delete', '{A}', $q$delete from public.audit_log$q$, 'state:42501');
select pg_temp.chk('audit: all 4 audited tables produced entries',
  (select count(distinct table_name) = 4 from public.audit_log
    where table_name in ('profiles','student_profiles','student_medical','room_assignments')));
select pg_temp.chk('audit: medical values never stored (no peanut/pollen/note values)',
  (select count(*) = 0 from public.audit_log where table_name='student_medical' and details::text ~* '(peanut|pollen|"note")'));
select pg_temp.chk('audit: medical change logged with field names only',
  (select count(*) >= 1 from public.audit_log where table_name='student_medical' and action='update'
     and actor_id='e0000000-0000-0000-0000-000000000002' and details -> 'changed_fields' ? 'notes'));
select pg_temp.chk('audit: room move recorded with actor',
  (select count(*) >= 1 from public.audit_log where table_name='room_assignments' and actor_id='e0000000-0000-0000-0000-000000000002'));
select pg_temp.chk('audit: approval recorded (status change old->new)',
  (select count(*) >= 1 from public.audit_log where table_name='student_profiles' and action='update'
     and details -> 'status' ->> 'new' = 'approved'));
select pg_temp.chk('audit: role change recorded for profiles',
  (select count(*) >= 1 from public.audit_log where table_name='profiles' and action='update' and details ? 'role'));
select pg_temp.chk('audit: update_requests/tokens are not in the audit log',
  (select count(*) = 0 from public.audit_log where details::text like '%' || (select v from kv where k='tok') || '%'));

-- ===================================================== 9. events / documents / storage
select pg_temp.t('events: E2 creates own draft session', '{E2}', $q$insert into public.event_sessions (educator_id, academic_year_id, title) values ('{E2}','{Y1}','Бесіда')$q$, 'ok');
insert into ids select 'SESS', id::text from public.event_sessions where educator_id = 'e0000000-0000-0000-0000-000000000002';
select pg_temp.t('events: E2 cannot create session for another educator', '{E2}', $q$insert into public.event_sessions (educator_id, academic_year_id, title) values ('{E3}','{Y1}','x')$q$, 'state:42501');
select pg_temp.t('events: E2 cannot create session as approved', '{E2}', $q$insert into public.event_sessions (educator_id, academic_year_id, title, status) values ('{E2}','{Y1}','x','approved')$q$, 'state:42501');
select pg_temp.t('events: E2 cannot self-approve', '{E2}', $q$update public.event_sessions set status='approved' where educator_id='{E2}'$q$, 'state:42501');
select pg_temp.t('events: E2 marks own session held', '{E2}', $q$update public.event_sessions set status='held', held_on=current_date where educator_id='{E2}'$q$, 'rows:1');
select pg_temp.t('events: E3 does not see E2 sessions', '{E3}', 'select 1 from public.event_sessions', 'rows:0');
select pg_temp.t('events: E2 sees own session', '{E2}', 'select 1 from public.event_sessions', 'rows:1');
select pg_temp.t('events: staff sees no sessions', '{ST}', 'select 1 from public.event_sessions', 'rows:0');
select pg_temp.t('attendance: E2 marks pupil present on own session', '{E2}', $q$insert into public.event_attendance (session_id, student_id) values ('{SESS}'::uuid, '{S4}'::uuid)$q$, 'ok');
select pg_temp.t('attendance: unique (session, pupil)', '{E2}', $q$insert into public.event_attendance (session_id, student_id) values ('{SESS}'::uuid, '{S4}'::uuid)$q$, 'state:23505');
select pg_temp.t('attendance: absence reason not allowed when present', '{E2}', $q$insert into public.event_attendance (session_id, student_id, present, absence_reason) values ('{SESS}'::uuid, '{S2}'::uuid, true, 'хворів')$q$, 'state:23514');
select pg_temp.t('attendance: absence with reason ok', '{E2}', $q$insert into public.event_attendance (session_id, student_id, present, absence_reason) values ('{SESS}'::uuid, '{S2}'::uuid, false, 'хворів')$q$, 'ok');
select pg_temp.t('attendance: E3 cannot write to E2 session', '{E3}', $q$insert into public.event_attendance (session_id, student_id) values ('{SESS}'::uuid, '{S1}'::uuid)$q$, 'state:42501');
select pg_temp.t('attendance: E3 cannot read E2 attendance', '{E3}', 'select 1 from public.event_attendance', 'rows:0');
select pg_temp.t('attendance: staff cannot read attendance', '{ST}', 'select 1 from public.event_attendance', 'rows:0');
select pg_temp.t('events: admin approves session', '{A}', $q$update public.event_sessions set status='approved' where educator_id='{E2}'$q$, 'rows:1');
select pg_temp.t('events: E2 cannot edit approved session', '{E2}', $q$update public.event_sessions set title='x' where educator_id='{E2}'$q$, 'rows:0');
select pg_temp.t('events: E2 cannot delete approved session', '{E2}', $q$delete from public.event_sessions where educator_id='{E2}'$q$, 'rows:0');
select pg_temp.t('attendance: E2 cannot change attendance of approved session', '{E2}', $q$update public.event_attendance set present=false$q$, 'rows:0');
select pg_temp.t('quotas: E2 sees only own quota', '{E2}', 'select 1 from public.event_quotas', 'rows:1');
select pg_temp.t('quotas: E2 cannot change quota', '{E2}', $q$update public.event_quotas set required_count = 0$q$, 'rows:0');
select pg_temp.t('quotas: admin changes quota', '{A}', $q$update public.event_quotas set required_count = 12 where educator_id='{E2}'$q$, 'rows:1');
select pg_temp.t('plan: educator reads event_plan', '{E2}', 'select 1 from public.event_plan', 'rows:1');
select pg_temp.t('plan: educator cannot edit plan not assigned to them', '{E2}', $q$update public.event_plan set notes='x'$q$, 'rows:0');
select pg_temp.t('plan: educator cannot insert plan', '{E2}', $q$insert into public.event_plan (planned_date, title) values (current_date,'x')$q$, 'state:42501');
select pg_temp.t('docs: E2 adds document as author', '{E2}', $q$insert into public.documents (title, storage_path, author_id, tags) values ('Doc E2','e2.pdf','{E2}', array['звіт'])$q$, 'ok');
select pg_temp.t('docs: E2 cannot add document in someone else''s name', '{E2}', $q$insert into public.documents (title, storage_path, author_id) values ('x','x2.pdf','{E3}')$q$, 'state:42501');
select pg_temp.t('docs: staff reads documents (2)', '{ST}', 'select 1 from public.documents', 'rows:2');
select pg_temp.t('docs: E3 cannot delete E2 document', '{E3}', $q$delete from public.documents where title='Doc E2'$q$, 'rows:0');
select pg_temp.t('docs: E2 deletes own document', '{E2}', $q$delete from public.documents where title='Doc E2'$q$, 'rows:1');
select pg_temp.t('templates: E2 cannot add template', '{E2}', $q$insert into public.document_templates (title, storage_path) values ('t','t.docx')$q$, 'state:42501');
select pg_temp.t('templates: admin adds template', '{A}', $q$insert into public.document_templates (title, storage_path) values ('t','t.docx')$q$, 'ok');
select pg_temp.t('templates: staff reads templates', '{ST}', 'select 1 from public.document_templates', 'rows:1');

select pg_temp.chk('storage: bucket "documents" exists and is private',
  (select count(*) = 1 from storage.buckets where id='documents' and public = false));
select pg_temp.t('storage: E2 uploads object', '{E2}', $q$insert into storage.objects (bucket_id, name, owner_id) values ('documents','t/e2.pdf','{E2}')$q$, 'ok');
select pg_temp.t('storage: staff cannot upload', '{ST}', $q$insert into storage.objects (bucket_id, name, owner_id) values ('documents','t/st.pdf','{ST}')$q$, 'state:42501');
select pg_temp.t('storage: staff (active) can read objects', '{ST}', $q$select 1 from storage.objects where bucket_id='documents'$q$, 'rows:1');
select pg_temp.t('storage: unactivated user cannot read objects', '{NEW}', $q$select 1 from storage.objects where bucket_id='documents'$q$, 'rows:0');
select pg_temp.t('storage: anon cannot read objects', 'anon', $q$select 1 from storage.objects where bucket_id='documents'$q$, 'deny');
-- NOTE: Supabase blocks direct DELETE on storage.objects for every role ("use the Storage API"),
-- so the delete/update policies cannot be exercised from SQL. We assert they exist instead;
-- their runtime behaviour must be checked through the Storage API from the app.
select pg_temp.chk('storage: select/insert/update/delete policies for bucket documents exist',
  (select count(distinct cmd) = 4 from pg_policies where schemaname='storage' and tablename='objects'
     and policyname like 'documents_bucket_%'));

-- ===================================================== 10. admin + misc
select pg_temp.t('admin reads all pupils', '{A}', 'select 1 from public.students', 'rows:6');
select pg_temp.t('admin reads medical', '{A}', 'select 1 from public.student_medical', 'rows:2');
select pg_temp.t('admin deletes pupil (cascade)', '{A}', $q$delete from public.students where id = '{S2}'$q$, 'rows:1');
select pg_temp.chk('cascade: room history of deleted pupil removed',
  (select count(*) = 0 from public.room_assignments where student_id='10000000-0000-0000-0000-000000000002'));
select pg_temp.chk('audit: deletion of room history logged',
  (select count(*) >= 1 from public.audit_log where table_name='room_assignments' and action='delete'));
select pg_temp.t('academic_years: second current year refused', 'postgres', $q$insert into public.academic_years (name,start_date,end_date,is_current) values ('2027/2028','2027-09-01','2028-06-30',true)$q$, 'state:23505');
select pg_temp.t('academic_years: admin adds non-current year', '{A}', $q$insert into public.academic_years (id,name,start_date,end_date) values ('{Y2}','2027/2028','2027-09-01','2028-06-30')$q$, 'ok');
select pg_temp.t('academic_years: educator cannot switch current year', '{E2}', $q$select public.set_current_academic_year('{Y2}')$q$, 'msg:FORBIDDEN');
select pg_temp.t('academic_years: admin switches current year', '{A}', $q$select public.set_current_academic_year('{Y2}')$q$, 'ok');
select pg_temp.chk('academic_years: exactly one current (Y2)',
  (select count(*) filter (where is_current) = 1 and count(*) filter (where is_current and id='30000000-0000-0000-0000-000000000002') = 1 from public.academic_years));
select pg_temp.chk('catalog: anon has NO table/column privileges on any public relation',
  (select count(*) = 0 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v','m','p','f')
      and (has_any_column_privilege('anon', c.oid, 'select,insert,update,references')
           or has_table_privilege('anon', c.oid, 'delete,truncate,trigger'))));
select pg_temp.chk('catalog: anon cannot EXECUTE any function in public/private',
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')));
select pg_temp.chk('catalog: RLS enabled on every public table',
  (select count(*) = 0 from pg_tables where schemaname='public' and not rowsecurity));
select pg_temp.chk('catalog: every public table has at least one policy',
  (select count(*) = 0 from pg_tables t where schemaname='public'
     and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.tablename)));

-- ------------------------------------------------------------------ report
select n, case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else info end as info
from test_results order by n;

rollback;
