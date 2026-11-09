-- Stage 5 (documents) checks. Run in ONE call; everything is ROLLED BACK at the end.
-- Same harness as 001: roles are emulated via set local role + request.jwt.claims.
-- Covers what the Documents UI relies on: upload/delete rights, based_on lineage, templates toggle,
-- app_settings toggle, and the data the template autofill reads.
begin;

create temp table test_results (n serial primary key, name text, ok boolean, info text);
create temp table ids (k text primary key, val text);
grant all on test_results, ids to public;
grant usage, select on sequence test_results_n_seq to public;
insert into ids values
 ('A','a0000000-0000-0000-0000-000000000001'), ('E2','e0000000-0000-0000-0000-000000000002'),
 ('E3','e0000000-0000-0000-0000-000000000003'), ('ST','b0000000-0000-0000-0000-000000000001'),
 ('Y1','30000000-0000-0000-0000-000000000001'), ('S1','10000000-0000-0000-0000-000000000001'),
 ('R1','20000000-0000-0000-0000-000000000201');
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

insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-0000-0000-000000000001','authenticated','authenticated','admin@test.local'),
  ('e0000000-0000-0000-0000-000000000002','authenticated','authenticated','e2@test.local'),
  ('e0000000-0000-0000-0000-000000000003','authenticated','authenticated','e3@test.local'),
  ('b0000000-0000-0000-0000-000000000001','authenticated','authenticated','staff@test.local');
update public.profiles set role='admin', is_active=true, full_name='Admin' where id='a0000000-0000-0000-0000-000000000001';
update public.profiles set role='educator', floor=2, is_active=true, full_name='Edu 2' where id='e0000000-0000-0000-0000-000000000002';
update public.profiles set role='educator', floor=3, is_active=true, full_name='Edu 3' where id='e0000000-0000-0000-0000-000000000003';
update public.profiles set role='staff_readonly', is_active=true, full_name='Staff' where id='b0000000-0000-0000-0000-000000000001';
insert into public.academic_years (id, name, start_date, end_date, is_current) values ('30000000-0000-0000-0000-000000000001', '2026/2027', '2026-09-01', '2027-06-30', true);
insert into public.students (id, last_name, first_name, grade, status, academic_year_id) values ('10000000-0000-0000-0000-000000000001', 'Тестенко', 'Олег', 10, 'active', '30000000-0000-0000-0000-000000000001');
insert into public.rooms (id, floor, number) values ('20000000-0000-0000-0000-000000000201', 2, '201');
insert into public.room_assignments (student_id, room_id) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000201');
insert into public.student_profiles (student_id, status, approved_by, approved_at, student_phone) values ('10000000-0000-0000-0000-000000000001','approved','a0000000-0000-0000-0000-000000000001', now(), '+380000000001');
insert into public.student_profiles (student_id, status, student_phone) values ('10000000-0000-0000-0000-000000000001','pending','+380000000002');

-- ---- documents: upload / author rules
select pg_temp.t('staff_readonly cannot insert document row', '{ST}', $q$insert into public.documents (title, storage_path, author_id) values ('x','documents/st.docx','{ST}')$q$, 'state:42501');
select pg_temp.t('staff_readonly cannot upload to bucket', '{ST}', $q$insert into storage.objects (bucket_id, name, owner_id) values ('documents','documents/st.docx','{ST}')$q$, 'state:42501');
select pg_temp.t('educator uploads to bucket', '{E2}', $q$insert into storage.objects (bucket_id, name, owner_id) values ('documents','documents/e2.docx','{E2}')$q$, 'ok');
select pg_temp.t('educator inserts own document', '{E2}', $q$insert into public.documents (id, title, category, topic, academic_year_id, author_id, storage_path, tags) values ('d0000000-0000-0000-0000-000000000001','Doc E2','Плани','Виховна','{Y1}','{E2}','documents/e2.docx', array['план'])$q$, 'ok');
select pg_temp.t('educator cannot insert document as another author', '{E2}', $q$insert into public.documents (title, storage_path, author_id) values ('x','documents/x.docx','{E3}')$q$, 'state:42501');
select pg_temp.t('based-on copy: E3 inserts row with based_on_document_id', '{E3}', $q$insert into public.documents (id, title, academic_year_id, author_id, storage_path, based_on_document_id) values ('d0000000-0000-0000-0000-000000000002','Copy E3','{Y1}','{E3}','documents/e3.docx','d0000000-0000-0000-0000-000000000001')$q$, 'ok');
select pg_temp.t('staff reads documents', '{ST}', 'select 1 from public.documents', 'rows:2');

-- ---- delete rights (documents table)
select pg_temp.t('educator cannot delete another author''s document', '{E3}', $q$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000001'$q$, 'rows:0');
select pg_temp.t('staff cannot delete documents', '{ST}', $q$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000002'$q$, 'rows:0');
select pg_temp.t('author deletes own document', '{E2}', $q$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000001'$q$, 'rows:1');
select pg_temp.chk('deleting the source keeps the copy and nulls based_on_document_id',
  (select based_on_document_id is null from public.documents where id = 'd0000000-0000-0000-0000-000000000002'));
select pg_temp.t('admin deletes any document', '{A}', $q$delete from public.documents where id = 'd0000000-0000-0000-0000-000000000002'$q$, 'rows:1');

-- ---- templates + toggle
select pg_temp.t('toggle OFF: educator cannot add template', '{E2}', $q$insert into public.document_templates (title, storage_path) values ('t','templates/t.docx')$q$, 'state:42501');
select pg_temp.t('admin adds template', '{A}', $q$insert into public.document_templates (title, storage_path, placeholders) values ('t','templates/t.docx','["student.full_name"]'::jsonb)$q$, 'ok');
select pg_temp.t('staff reads templates', '{ST}', 'select 1 from public.document_templates', 'rows:1');
select pg_temp.t('educator cannot change the toggle', '{E2}', $q$update public.app_settings set value = 'true'::jsonb where key = 'educators_can_edit_templates'$q$, 'rows:0');
select pg_temp.t('educator can read the toggle', '{E2}', $q$select 1 from public.app_settings where key = 'educators_can_edit_templates'$q$, 'rows:1');
select pg_temp.t('admin upserts the toggle (as the UI does)', '{A}', $q$insert into public.app_settings (key, value) values ('educators_can_edit_templates','true'::jsonb) on conflict (key) do update set value = excluded.value$q$, 'ok');
select pg_temp.t('toggle ON: educator adds template', '{E2}', $q$insert into public.document_templates (title, storage_path) values ('t2','templates/t2.docx')$q$, 'ok');
select pg_temp.t('toggle ON: staff still cannot add template', '{ST}', $q$insert into public.document_templates (title, storage_path) values ('t3','templates/t3.docx')$q$, 'state:42501');
select pg_temp.t('admin switches toggle OFF', '{A}', $q$update public.app_settings set value = 'false'::jsonb where key = 'educators_can_edit_templates'$q$, 'rows:1');
select pg_temp.t('toggle OFF: educator cannot delete templates', '{E2}', $q$delete from public.document_templates$q$, 'rows:0');

-- ---- data the autofill reads (same shape as src/features/documents/api.ts loadPupils)
select pg_temp.t('educator reads student + open room + approved profile',
  '{E2}', $q$select s.id from public.students s
    left join public.room_assignments ra on ra.student_id = s.id and ra.to_date is null
    left join public.rooms r on r.id = ra.room_id
    left join public.student_profiles sp on sp.student_id = s.id and sp.status = 'approved'
    where r.number = '201' and sp.student_phone = '+380000000001'$q$, 'rows:1');
select pg_temp.t('staff_readonly sees only the approved profile (not pending)', '{ST}', 'select 1 from public.student_profiles', 'rows:1');
select pg_temp.t('autofill never needs medical data: staff cannot read student_medical', '{ST}', 'select 1 from public.student_medical', 'rows:0');

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, count(*) as total,
  coalesce(string_agg(n || ': ' || name || ' -> ' || info, E'\n') filter (where not ok), 'no failures') as failures
from test_results;

rollback;
