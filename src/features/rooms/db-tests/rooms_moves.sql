-- Тести переміщень (етап 3). Один виклик (execute_sql), усе в транзакції з ROLLBACK; дані вигадані.
-- Ролі емулюються: set local role authenticated + request.jwt.claims.
begin;
create temp table test_results (n serial primary key, name text, ok boolean, info text);
grant all on test_results to public; grant usage, select on sequence test_results_n_seq to public;

create function pg_temp.as_user(p text) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $f$;

-- expect: ok | msg:TEXT (виняток містить TEXT) | rows:N
create function pg_temp.t(p_name text, p_user text, p_sql text, p_expect text) returns void language plpgsql as $f$
declare v_rows int; v_msg text; v_ok boolean; v_err boolean := false;
begin
  perform pg_temp.as_user(p_user);
  begin execute p_sql; get diagnostics v_rows = row_count;
  exception when others then v_err := true; v_msg := sqlstate || ' ' || sqlerrm; end;
  reset role;
  v_ok := case when p_expect = 'ok' then not v_err
               when p_expect like 'rows:%' then not v_err and v_rows = substr(p_expect,6)::int
               else v_err and v_msg like '%' || substr(p_expect,5) || '%' end;
  insert into test_results(name, ok, info) values (p_name, coalesce(v_ok,false), format('expect=%s err=%s rows=%s', p_expect, left(v_msg,90), v_rows));
end $f$;
create function pg_temp.chk(p_name text, p_cond boolean) returns void language plpgsql as $f$
begin reset role; insert into test_results(name, ok) values (p_name, coalesce(p_cond,false)); end $f$;

insert into auth.users (id, aud, role, email) values
 ('e0000000-0000-0000-0000-000000000002','authenticated','authenticated','e2@test.local'),
 ('e0000000-0000-0000-0000-000000000003','authenticated','authenticated','e3@test.local'),
 ('a0000000-0000-0000-0000-000000000001','authenticated','authenticated','a@test.local'),
 ('b0000000-0000-0000-0000-000000000001','authenticated','authenticated','s@test.local');
update public.profiles set role='educator', floor=2, is_active=true, full_name='Вихователь 2' where id='e0000000-0000-0000-0000-000000000002';
update public.profiles set role='educator', floor=3, is_active=true, full_name='Вихователь 3' where id='e0000000-0000-0000-0000-000000000003';
update public.profiles set role='admin', is_active=true, full_name='Адмін' where id='a0000000-0000-0000-0000-000000000001';
update public.profiles set role='staff_readonly', is_active=true, full_name='Перегляд' where id='b0000000-0000-0000-0000-000000000001';

insert into public.academic_years (id,name,start_date,end_date,is_current) values ('30000000-0000-0000-0000-000000000001','2026/2027','2026-09-01','2027-06-30',true);
insert into public.students (id,last_name,first_name,grade,status,academic_year_id)
select ('10000000-0000-0000-0000-00000000000'||i)::uuid, 'Учень'||i, 'Тест', 10, 'active', '30000000-0000-0000-0000-000000000001' from generate_series(1,6) i;
insert into public.rooms (id,floor,number,capacity,is_active) values
 ('20000000-0000-0000-0000-000000000202',2,'202',2,true),   -- місткість 2
 ('20000000-0000-0000-0000-000000000412',4,'412',5,true),
 ('20000000-0000-0000-0000-000000000500',5,'500',4,false);  -- неактивна

-- S1,S2 -> 202 (заповнена), S3 -> 412 ; S4,S5,S6 у пулі
select pg_temp.t('assign S1 -> 202 (educator floor 2)','e0000000-0000-0000-0000-000000000002',$$select public.assign_student('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000202','нове')$$,'ok');
select pg_temp.t('assign S2 -> 202 (educator floor 3, чужий поверх)','e0000000-0000-0000-0000-000000000003',$$select public.assign_student('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000202',null)$$,'ok');
select pg_temp.t('assign S3 -> 412','e0000000-0000-0000-0000-000000000002',$$select public.assign_student('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000412',null)$$,'ok');
select pg_temp.chk('v_room_occupancy: 202 = 2/2, free 0', (select occupied=2 and free=0 from v_room_occupancy where room='202'));
select pg_temp.chk('v_unplaced_students: 3 учні у пулі', (select count(*)=3 from v_unplaced_students));

select pg_temp.t('move 412 -> 202 refused: ROOM_FULL','e0000000-0000-0000-0000-000000000002',$$select public.move_student('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000202',null)$$,'msg:ROOM_FULL');
select pg_temp.t('assign pool -> 202 refused: ROOM_FULL','e0000000-0000-0000-0000-000000000002',$$select public.assign_student('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000202',null)$$,'msg:ROOM_FULL');
select pg_temp.t('assign into inactive 500 refused','e0000000-0000-0000-0000-000000000002',$$select public.assign_student('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000500',null)$$,'msg:ROOM_INACTIVE');
select pg_temp.t('move into same room refused: ALREADY_IN_ROOM','e0000000-0000-0000-0000-000000000002',$$select public.move_student('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000412',null)$$,'msg:ALREADY_IN_ROOM');
select pg_temp.t('duplicate assign of placed pupil refused: ALREADY_PLACED','e0000000-0000-0000-0000-000000000002',$$select public.assign_student('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000412',null)$$,'msg:ALREADY_PLACED');
select pg_temp.t('move of unplaced pupil refused: NOT_PLACED','e0000000-0000-0000-0000-000000000002',$$select public.move_student('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000412',null)$$,'msg:NOT_PLACED');
select pg_temp.chk('refusals changed nothing: S3 still in 412, 202 still 2', (select count(*)=1 from room_assignments where student_id='10000000-0000-0000-0000-000000000003' and to_date is null and room_id='20000000-0000-0000-0000-000000000412') and (select occupied=2 from v_room_occupancy where room='202'));

-- успішне переселення між поверхами 2 -> 4 з причиною
select pg_temp.t('move S1 202 -> 412 (різні поверхи, будь-який вихователь)','e0000000-0000-0000-0000-000000000003',$$select public.move_student('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000412','за проханням')$$,'ok');
select pg_temp.chk('move: old row closed with ended_by/end_reason, new row has moved_by/reason',
  (select to_date is not null and ended_by='e0000000-0000-0000-0000-000000000003' and end_reason='за проханням' from room_assignments where student_id='10000000-0000-0000-0000-000000000001' and room_id='20000000-0000-0000-0000-000000000202')
  and (select to_date is null and moved_by='e0000000-0000-0000-0000-000000000003' and reason='за проханням' from room_assignments where student_id='10000000-0000-0000-0000-000000000001' and room_id='20000000-0000-0000-0000-000000000412'));

-- unassign -> assign зберігає історію
select pg_temp.t('unassign S1 (назад у пул)','e0000000-0000-0000-0000-000000000002',$$select public.unassign_student('10000000-0000-0000-0000-000000000001','помилка')$$,'ok');
select pg_temp.chk('S1 у пулі', exists (select 1 from v_unplaced_students where id='10000000-0000-0000-0000-000000000001'));
select pg_temp.t('assign S1 з пулу -> 202','e0000000-0000-0000-0000-000000000002',$$select public.assign_student('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000202',null)$$,'ok');
select pg_temp.chk('історія S1 зберігає 3 записи (202, 412, 202), відкритий один',
  (select count(*)=3 and count(*) filter (where to_date is null)=1 from room_assignments where student_id='10000000-0000-0000-0000-000000000001'));

-- права
select pg_temp.t('staff_readonly cannot move','b0000000-0000-0000-0000-000000000001',$$select public.move_student('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000412',null)$$,'msg:FORBIDDEN');
select pg_temp.t('staff_readonly cannot assign','b0000000-0000-0000-0000-000000000001',$$select public.assign_student('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000412',null)$$,'msg:FORBIDDEN');
select pg_temp.t('staff_readonly cannot unassign','b0000000-0000-0000-0000-000000000001',$$select public.unassign_student('10000000-0000-0000-0000-000000000003',null)$$,'msg:FORBIDDEN');
select pg_temp.t('staff_readonly cannot update room capacity','b0000000-0000-0000-0000-000000000001',$$update public.rooms set capacity=6 where number='412'$$,'rows:0');
select pg_temp.t('staff_readonly reads history (sees all room_assignments rows)','b0000000-0000-0000-0000-000000000001',$q$do $d$ begin if (select count(*) from public.room_assignments) < 5 then raise exception 'TOO_FEW_ROWS'; end if; end $d$$q$,'ok');
-- керування кімнатами
select pg_temp.t('educator: capacity 202 -> 1 (< occupancy 2) refused','e0000000-0000-0000-0000-000000000003',$$update public.rooms set capacity=1 where number='202'$$,'msg:CAPACITY_BELOW_OCCUPANCY');
select pg_temp.t('educator: capacity 202 -> 6 ok (чужий поверх)','e0000000-0000-0000-0000-000000000003',$$update public.rooms set capacity=6 where number='202'$$,'rows:1');
select pg_temp.t('educator cannot deactivate room (admin only)','e0000000-0000-0000-0000-000000000003',$$update public.rooms set is_active=false where number='412'$$,'msg:FORBIDDEN');
select pg_temp.t('admin cannot deactivate non-empty room','a0000000-0000-0000-0000-000000000001',$$update public.rooms set is_active=false where number='412'$$,'msg:ROOM_NOT_EMPTY');
select pg_temp.t('admin creates room 305','a0000000-0000-0000-0000-000000000001',$$insert into public.rooms(floor,number,capacity) values (3,'305',5)$$,'rows:1');
select pg_temp.t('admin duplicate room number refused','a0000000-0000-0000-0000-000000000001',$$insert into public.rooms(floor,number) values (3,'305')$$,'23505');
select pg_temp.t('educator cannot create room','e0000000-0000-0000-0000-000000000003',$$insert into public.rooms(floor,number) values (3,'306')$$,'msg:row-level security');
select pg_temp.t('admin: floor 6 refused','a0000000-0000-0000-0000-000000000001',$$insert into public.rooms(floor,number) values (6,'601')$$,'23514');
select pg_temp.t('admin deactivates empty room 305','a0000000-0000-0000-0000-000000000001',$$update public.rooms set is_active=false where number='305'$$,'rows:1');

reset role;
select n, ok, name, info from test_results order by n;
rollback;
