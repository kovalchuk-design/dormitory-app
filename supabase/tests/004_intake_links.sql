-- Shared per-floor intake links: lifecycle, auto-matching by exact ПІБ + birth date, unmatched queue, RLS, privileges.
-- Single call, everything is ROLLED BACK at the end. Result: one summary row.
begin;
create temp table test_results (n serial primary key, name text, ok boolean, info text);
grant all on test_results to public;
grant usage, select on sequence test_results_n_seq to public;
create temp table tok (k text primary key, v text);
grant all on tok to public;

insert into auth.users (id, aud, role, email) values
  ('e3000000-0000-0000-0000-000000000001','authenticated','authenticated','edu3@test.local'),
  ('e3000000-0000-0000-0000-000000000002','authenticated','authenticated','ro3@test.local');
update public.profiles set role='educator', floor=2, is_active=true where id='e3000000-0000-0000-0000-000000000001';
update public.profiles set role='staff_readonly', is_active=true where id='e3000000-0000-0000-0000-000000000002';

insert into public.students (id, last_name, first_name, patronymic, birth_date, grade) values
  ('53000000-0000-0000-0000-00000000000a','Воробйова','Ангеліна','Василівна','2008-07-31',11),
  ('53000000-0000-0000-0000-0000000000b1','Дубль','Дубль','Дублівна','2009-01-01',10),
  ('53000000-0000-0000-0000-0000000000b2','Дубль','Дубль','Дублівна','2009-01-01',10),
  ('53000000-0000-0000-0000-00000000000c','Випускник','Петро',null,'2007-05-05',11),
  ('53000000-0000-0000-0000-00000000000d','Безнародження','Іван',null,null,9),
  ('53000000-0000-0000-0000-00000000000f','Дем''ян','Олег','Іванович','2009-09-09',10);
update public.students set status='graduated' where id='53000000-0000-0000-0000-00000000000c';

insert into test_results (name, ok, info) select 'norm_name: case, spaces, apostrophes, Cyrillic',
  private.norm_name('  ВОРОБЙОВА   Ангеліна ') = 'воробйова ангеліна' and private.norm_name('Дем’ян') = private.norm_name('Дем''ян') and private.norm_name('Дем`ян') = 'демян',
  private.norm_name('  ВОРОБЙОВА   Ангеліна ');

-- ----------------------------------------------------------------- link lifecycle
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into tok select 'f3_old', public.create_intake_link(3, 7);
insert into tok select 'f3', public.create_intake_link(3, 7);
insert into tok select 'f4', public.create_intake_link(4, 7);
insert into tok select 'f5_cap', public.create_intake_link(5, 7);
insert into tok select 'f2_exp', public.create_intake_link(2, 7);
do $$ declare ok boolean := false; begin
  begin perform public.create_intake_link(7, 7); exception when others then ok := sqlerrm like 'INVALID%'; end;
  insert into test_results (name, ok) values ('create_intake_link: floor must be 2..5', ok);
  ok := false;
  begin perform public.create_intake_link(3, 0); exception when others then ok := sqlerrm like 'INVALID%'; end;
  insert into test_results (name, ok) values ('create_intake_link: ttl must be 1..30', ok);
end $$;
reset role;
create temp view th as select k, encode(extensions.digest(v,'sha256'),'hex') as h from tok;
grant select on th to public;
create temp view tl as select id from public.intake_links where token_hash in (select h from th);
grant select on tl to public;
update public.intake_links set expires_at = now() - interval '1 second', created_at = now() - interval '2 days'
 where token_hash = (select h from th where k='f2_exp');
update public.intake_links set max_submissions = 1 where token_hash = (select h from th where k='f5_cap');

insert into test_results (name, ok) select 'new link on the same floor revokes the old one (1 live link per floor)',
  (select count(*) from public.intake_links where floor = 3 and revoked_at is null) = 1
  and (select revoked_at is not null from public.intake_links where token_hash = (select h from th where k='f3_old'))
  and (select count(*) from public.intake_links where floor = 4 and revoked_at is null) = 1;

set local role anon;
do $$ declare ok boolean := false; begin
  begin perform public.create_intake_link(3, 7); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot create_intake_link', ok);
  ok := false;
  begin perform public.submit_intake(repeat('0',64), '{}'); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call submit_intake', ok);
  ok := false;
  begin perform public.get_intake_link_state(repeat('0',64)); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot call get_intake_link_state', ok);
  ok := false;
  begin perform 1 from public.intake_links; exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot SELECT intake_links', ok);
  ok := false;
  begin perform 1 from public.intake_submissions; exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('anon cannot SELECT intake_submissions', ok);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ declare ok boolean := false; begin
  begin perform public.create_intake_link(3, 7); exception when others then ok := sqlerrm like 'FORBIDDEN%'; end;
  insert into test_results (name, ok) values ('staff_readonly cannot create_intake_link', ok);
  ok := false;
  begin perform public.submit_intake(repeat('0',64), '{}'); exception when insufficient_privilege then ok := true; end;
  insert into test_results (name, ok) values ('authenticated cannot call submit_intake', ok);
end $$;
reset role;

-- ----------------------------------------------------------------- submissions (service_role = Edge Function)
create temp table base (j jsonb); grant all on base to public;
insert into base values ('{"consent":true,"room":"213","group_number":"7","profession":"Автослюсар","class_teacher":"С","master":"С",
  "address":"а","student_phone":"+380985504113","mother_name":"немає","mother_phone":"","father_name":"Тато Т","father_phone":"+380687763053",
  "guardian_name":"Бабка І","guardian_phone":"+380969410975","guardian_relation":"бабуся","school_activities":"в","college_plans":"в",
  "social_codes":["large_family"],"social_children":"3","social_status":"Багатодітна сім''я (неповнолітніх дітей: 3)",
  "allergies":"пилок","chronic_conditions":"немає"}');
create function public.zz_p(n text, d text) returns jsonb language sql as
  $$ select (select j from base) || jsonb_build_object('full_name', n, 'birth_date', d) $$;
grant execute on function public.zz_p(text, text) to public;

set local role service_role;
insert into test_results (name, ok) select 'link state: valid true; revoked/expired/unknown false',
  public.get_intake_link_state((select h from th where k='f3'))
  and not public.get_intake_link_state((select h from th where k='f3_old'))
  and not public.get_intake_link_state((select h from th where k='f2_exp'))
  and not public.get_intake_link_state(repeat('0',64));
insert into test_results (name, ok) select 'submit_intake: revoked / expired / unknown link → false',
  not public.submit_intake((select h from th where k='f3_old'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'))
  and not public.submit_intake((select h from th where k='f2_exp'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'))
  and not public.submit_intake(repeat('0',64), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'));
insert into test_results (name, ok) select 'submit_intake: no consent → false',
  not public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31') || '{"consent":false}');

-- exact match with sloppy case/spacing
insert into test_results (name, ok) select 'valid link → true (matched case; pupil learns nothing)',
  public.submit_intake((select h from th where k='f3'), public.zz_p('воробйова  АНГЕЛІНА василівна ','2008-07-31'));
-- apostrophe variants
insert into test_results (name, ok) select 'valid link → true (apostrophe variant)',
  public.submit_intake((select h from th where k='f3'), public.zz_p('Дем’ян Олег Іванович','2009-09-09'));
-- non-matching cases (still true for the pupil)
insert into test_results (name, ok) select 'valid link → true for every unmatched case',
  public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-30'))     -- wrong dob
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна','2008-07-31'))           -- no patronymic
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Дубль Дубль Дублівна','2009-01-01'))         -- ambiguous (2 pupils)
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Випускник Петро','2007-05-05'))              -- graduated
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Безнародження Іван','2010-02-02'))           -- base has no birth date
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Новий Учень Тестович','2010-03-03'));        -- unknown
reset role;

insert into test_results (name, ok, info) select 'auto-match: exact unique active pupil → matched/auto + ONE pending version, answers cleared',
  (select count(*) from public.intake_submissions where match_method='auto' and student_id='53000000-0000-0000-0000-00000000000a') = 1
  and (select count(*) from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000a' and status='pending') = 1
  and (select bool_and(payload is null) from public.intake_submissions where status='matched' and link_id in (select id from tl)),
  (select count(*)::text from public.intake_submissions where status='matched' and link_id in (select id from tl));
insert into test_results (name, ok) select 'auto-match works with apostrophe variants',
  exists (select 1 from public.intake_submissions where student_id='53000000-0000-0000-0000-00000000000f' and match_method='auto');
insert into test_results (name, ok, info) select 'unmatched: wrong dob / no patronymic / ambiguous / graduated / no dob in base / unknown → 6 in queue, answers kept',
  (select count(*) from public.intake_submissions where status='unmatched' and payload is not null and link_id in (select id from tl)) = 6
  and (select count(*) from public.student_profiles where student_id in ('53000000-0000-0000-0000-0000000000b1','53000000-0000-0000-0000-0000000000b2',
        '53000000-0000-0000-0000-00000000000c','53000000-0000-0000-0000-00000000000d')) = 0,
  (select count(*)::text from public.intake_submissions where status='unmatched' and link_id in (select id from tl));
insert into test_results (name, ok) select 'matched pending version carries the pupil data + consent_at, nobody approved it',
  (select profession='Автослюсар' and guardian_relation='бабуся' and (social_status_data -> 'codes') @> '"large_family"'::jsonb and consent_at is not null
          and approved_by is null and status='pending'
     from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000a');
insert into test_results (name, ok) select 'medical typed in the shared form is held in submissions, not in student_medical',
  (select count(*) from public.student_medical_submissions sm join public.student_profiles sp on sp.id = sm.profile_id where sp.student_id::text like '53000000%') = 2
  and (select count(*) from public.student_medical where student_id::text like '53000000%') = 0;

-- flooding guard: pupil A already has 1 pending; 4 more allowed (5), the 6th goes to the queue
set local role service_role;
insert into test_results (name, ok) select 'flood guard: 4 more matched (5 pending), 6th goes to unmatched',
  public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'))
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'))
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'))
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'))
  and public.submit_intake((select h from th where k='f3'), public.zz_p('Воробйова Ангеліна Василівна','2008-07-31'));
-- submission cap (max_submissions = 1)
create temp table cap (n int, r boolean); grant all on cap to public;
insert into cap select 1, public.submit_intake((select h from th where k='f5_cap'), public.zz_p('Новий Двійка Тестович','2010-04-04'));
insert into cap select 2, public.submit_intake((select h from th where k='f5_cap'), public.zz_p('Новий Двійка Тестович','2010-04-04'));
insert into test_results (name, ok) select 'submission cap: 1st accepted, 2nd refused, link state turns false',
  (select r from cap where n=1) and not (select r from cap where n=2) and not public.get_intake_link_state((select h from th where k='f5_cap'));
reset role;
insert into test_results (name, ok, info) select 'flood guard result: A has exactly 5 pending',
  (select count(*) from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000a' and status='pending') = 5,
  (select count(*)::text from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000a' and status='pending');

-- DB invariant: an unmatched row must keep its answers
do $$ declare ok boolean := false; begin
  begin update public.intake_submissions set payload = null where status = 'unmatched'; exception when check_violation then ok := true; end;
  insert into test_results (name, ok) values ('constraint: unmatched submission cannot lose its answers', ok);
end $$;

-- ----------------------------------------------------------------- RLS
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
insert into test_results (name, ok) select 'staff_readonly sees no intake links / submissions',
  (select count(*) from public.intake_links) = 0 and (select count(*) from public.intake_submissions) = 0;
do $$ declare ok boolean := false; begin
  begin perform public.resolve_intake_submission(gen_random_uuid(), gen_random_uuid()); exception when others then ok := sqlerrm like 'FORBIDDEN%'; end;
  insert into test_results (name, ok) values ('staff_readonly cannot resolve', ok);
  ok := false;
  begin perform public.dismiss_intake_submission(gen_random_uuid()); exception when others then ok := sqlerrm like 'FORBIDDEN%'; end;
  insert into test_results (name, ok) values ('staff_readonly cannot dismiss', ok);
  ok := false;
  begin perform public.create_student_from_intake(gen_random_uuid(), 10); exception when others then ok := sqlerrm like 'FORBIDDEN%'; end;
  insert into test_results (name, ok) values ('staff_readonly cannot create student from intake', ok);
end $$;
reset role;

-- ----------------------------------------------------------------- educator resolves the queue
create temp table ids (k text primary key, v uuid); grant all on ids to public;
insert into ids select 'wrongdob', id from public.intake_submissions where status='unmatched' and submitted_full_name='Воробйова Ангеліна Василівна' and submitted_birth_date='2008-07-30';
insert into ids select 'nodob', id from public.intake_submissions where status='unmatched' and submitted_full_name='Безнародження Іван';
insert into ids select 'grad', id from public.intake_submissions where status='unmatched' and submitted_full_name='Випускник Петро';
insert into ids select 'newpupil', id from public.intake_submissions where status='unmatched' and submitted_full_name='Новий Учень Тестович';
insert into ids select 'spam', id from public.intake_submissions where status='unmatched' and submitted_full_name='Дубль Дубль Дублівна';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into test_results (name, ok) select 'educator sees links and the unmatched queue',
  (select count(*) from public.intake_links where id in (select id from tl)) = 5 and (select count(*) from public.intake_submissions where status='unmatched' and link_id in (select id from tl)) >= 6;
select public.resolve_intake_submission((select v from ids where k='nodob'), '53000000-0000-0000-0000-00000000000d');
do $$ declare ok boolean := false; begin
  begin perform public.resolve_intake_submission((select v from ids where k='nodob'), '53000000-0000-0000-0000-00000000000d'); exception when others then ok := sqlerrm like 'NOT_PENDING%'; end;
  insert into test_results (name, ok) values ('resolving twice → NOT_PENDING', ok);
  ok := false;
  begin perform public.resolve_intake_submission((select v from ids where k='grad'), '53000000-0000-0000-0000-00000000000c'); exception when others then ok := sqlerrm like 'STUDENT_NOT_ACTIVE%'; end;
  insert into test_results (name, ok) values ('resolving to a graduated pupil → STUDENT_NOT_ACTIVE', ok);
  ok := false;
  begin perform public.create_student_from_intake((select v from ids where k='newpupil'), 12); exception when others then ok := sqlerrm like 'INVALID%'; end;
  insert into test_results (name, ok) values ('create_student_from_intake: grade must be 9..11', ok);
end $$;
select public.create_student_from_intake((select v from ids where k='newpupil'), 10);
select public.dismiss_intake_submission((select v from ids where k='spam'));
do $$ declare ok boolean := false; begin
  begin perform public.dismiss_intake_submission((select v from ids where k='spam')); exception when others then ok := sqlerrm like 'NOT_FOUND%'; end;
  insert into test_results (name, ok) values ('dismissing twice → NOT_FOUND', ok);
end $$;
reset role;

insert into test_results (name, ok) select 'manual resolve: pending version for that pupil, birth date filled where it was empty, answers cleared, who/when recorded',
  (select s.birth_date = '2010-02-02' from public.students s where s.id='53000000-0000-0000-0000-00000000000d')
  and (select count(*) from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000d' and status='pending') = 1
  and (select status='matched' and match_method='manual' and payload is null and resolved_by='e3000000-0000-0000-0000-000000000001' and resolved_at is not null
         from public.intake_submissions where id=(select v from ids where k='nodob'));
insert into test_results (name, ok, info) select 'new pupil created from intake: name split, birth date, grade, pending version',
  (select last_name='Новий' and first_name='Учень' and patronymic='Тестович' and birth_date='2010-03-03' and grade=10 and status='active'
     from public.students where last_name='Новий' and first_name='Учень')
  and (select count(*) from public.student_profiles sp join public.students s on s.id=sp.student_id where s.last_name='Новий' and sp.status='pending') = 1
  and (select match_method='new_student' from public.intake_submissions where id=(select v from ids where k='newpupil')),
  (select concat_ws('|', last_name, first_name, patronymic) from public.students where last_name='Новий' and first_name='Учень');
insert into test_results (name, ok) select 'dismissed spam: status dismissed, answers purged, no profile',
  (select status='dismissed' and payload is null and profile_id is null from public.intake_submissions where id=(select v from ids where k='spam'));

-- human approves an auto-matched version (unchanged flow)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.approve_student_profile((select id from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000f' and status='pending'));
reset role;
insert into test_results (name, ok) select 'approving an auto-matched version works and applies held medical',
  (select status='approved' and approved_by='e3000000-0000-0000-0000-000000000001' from public.student_profiles where student_id='53000000-0000-0000-0000-00000000000f')
  and (select allergies='пилок' from public.student_medical where student_id='53000000-0000-0000-0000-00000000000f');

-- who filled in: every row has the link; progress is derivable
insert into test_results (name, ok) select 'journal: every submission is tied to its link',
  not exists (select 1 from public.intake_submissions where link_id is null)
  and (select count(distinct link_id) from public.intake_submissions where link_id in (select id from tl)) = 2;

select jsonb_build_object('passed', count(*) filter (where ok), 'total', count(*),
  'failed', coalesce(jsonb_agg(jsonb_build_object('n', n, 'name', name, 'info', info) order by n) filter (where not ok), '[]'::jsonb)) as summary
from test_results;
rollback;
