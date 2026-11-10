-- Professions catalogue: RLS (admin writes, active users read, anon nothing) and the case-insensitive unique name.
-- Single call, ROLLED BACK at the end. Result: one summary row.
begin;
create temp table test_results (n serial primary key, name text, ok boolean, info text);
grant all on test_results to public;
grant usage, select on sequence test_results_n_seq to public;

insert into auth.users (id, aud, role, email) values
  ('e5000000-0000-0000-0000-000000000001','authenticated','authenticated','adm5@test.local'),
  ('e5000000-0000-0000-0000-000000000002','authenticated','authenticated','edu5@test.local'),
  ('e5000000-0000-0000-0000-000000000003','authenticated','authenticated','ro5@test.local');
update public.profiles set role='admin', is_active=true where id='e5000000-0000-0000-0000-000000000001';
update public.profiles set role='educator', floor=2, is_active=true where id='e5000000-0000-0000-0000-000000000002';
update public.profiles set role='staff_readonly', is_active=true where id='e5000000-0000-0000-0000-000000000003';

-- admin
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.professions (name, sort_order) values ('Тестова професія Альфа', 1);
update public.professions set is_active = false where name = 'Тестова професія Альфа';
insert into test_results (name, ok) select 'admin can insert and update', (select is_active = false from public.professions where name = 'Тестова професія Альфа');
do $$ declare ok boolean := false; begin
  begin insert into public.professions (name) values ('  тестова ПРОФЕСІЯ альфа '); exception when unique_violation then ok := true; end;
  insert into test_results (name, ok) values ('duplicate name (case/space-insensitive) is rejected', ok);
  ok := false;
  begin insert into public.professions (name) values ('x'); exception when check_violation then ok := true; end;
  insert into test_results (name, ok) values ('too short name is rejected', ok);
  ok := false;
  begin insert into public.professions (name) values (repeat('я', 201)); exception when check_violation then ok := true; end;
  insert into test_results (name, ok) values ('name longer than 200 is rejected', ok);
end $$;
reset role;

-- educator: reads, cannot write
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e5000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
insert into test_results (name, ok) select 'educator can read the catalogue', (select count(*) from public.professions where name = 'Тестова професія Альфа') = 1;
do $$ declare ok boolean := false; begin
  begin insert into public.professions (name) values ('Професія від вихователя'); exception when others then ok := true; end;
  insert into test_results (name, ok) values ('educator cannot insert', ok);
end $$;
update public.professions set name = 'Змінено вихователем' where name = 'Тестова професія Альфа';
delete from public.professions where name = 'Тестова професія Альфа';
reset role;
insert into test_results (name, ok) select 'educator update/delete affect no rows (RLS)', (select count(*) from public.professions where name = 'Тестова професія Альфа') = 1;

-- staff_readonly: reads
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e5000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
insert into test_results (name, ok) select 'staff_readonly can read', (select count(*) from public.professions) >= 1;
do $$ declare ok boolean := false; begin
  begin insert into public.professions (name) values ('Професія від перегляду'); exception when others then ok := true; end;
  insert into test_results (name, ok) values ('staff_readonly cannot insert', ok);
end $$;
reset role;

-- anon: nothing
set local role anon;
do $$ declare ok boolean := false; begin
  begin perform 1 from public.professions; exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot SELECT professions', ok);
  ok := false;
  begin insert into public.professions (name) values ('Анонімна'); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot INSERT into professions', ok);
end $$;
reset role;

-- service_role (Edge Function) reads active entries only when it filters
set local role service_role;
insert into test_results (name, ok) select 'service_role can read', (select count(*) from public.professions) >= 1;
reset role;

-- admin deletes
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
delete from public.professions where name = 'Тестова професія Альфа';
reset role;
insert into test_results (name, ok) select 'admin can delete', (select count(*) from public.professions where name = 'Тестова професія Альфа') = 0;

select jsonb_build_object('passed', count(*) filter (where ok), 'total', count(*),
  'failed', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'info', info) order by n) filter (where not ok), '[]'::jsonb)) as summary
from test_results;
rollback;
