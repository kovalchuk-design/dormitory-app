-- Режим «Обхід»: відмітки «залишається на ніч» і чергові на поверсі.
-- Один рядок = учень присутній цього вечора. Немає рядка = учня немає.
-- «Вечір» змінюється о 18:00 за Києвом: до 18:00 діє вчорашній вечір (звіт видно весь наступний день).

create or replace function public.night_today()
returns date language sql stable set search_path = '' as $$
  select (((now() at time zone 'Europe/Kyiv') - interval '18 hours'))::date
$$;
comment on function public.night_today() is 'Date of the current duty evening (Kyiv): switches at 18:00.';

create table public.night_roster (
  night_date date        not null default public.night_today(),
  student_id uuid        not null references public.students (id) on delete cascade,
  room_id    uuid        not null references public.rooms (id) on delete restrict,
  is_duty    boolean     not null default false,
  marked_by  uuid        references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (night_date, student_id)
);
comment on table public.night_roster is 'Evening round: pupils staying overnight (row exists) and floor duty pupils (is_duty). Rows are history, never bulk-cleared.';
create index night_roster_room_id_idx on public.night_roster (room_id);
create index night_roster_marked_by_idx on public.night_roster (marked_by);
create index night_roster_student_id_idx on public.night_roster (student_id);

-- не більше двох чергових на поверх за вечір
create or replace function private.night_roster_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_floor int;
  v_cnt int;
begin
  new.marked_by := coalesce(new.marked_by, auth.uid());
  if new.is_duty then
    select floor into v_floor from public.rooms where id = new.room_id;
    select count(*) into v_cnt
      from public.night_roster n join public.rooms r on r.id = n.room_id
     where n.night_date = new.night_date and n.is_duty and r.floor = v_floor
       and n.student_id <> new.student_id;
    if v_cnt >= 2 then
      raise exception 'DUTY_LIMIT: at most 2 duty pupils per floor' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.night_roster_guard() from public, anon, authenticated;

create trigger night_roster_guard before insert or update on public.night_roster
  for each row execute function private.night_roster_guard();

alter table public.night_roster enable row level security;
create policy night_roster_select on public.night_roster for select to authenticated
  using ((select private.is_active_user()));
create policy night_roster_insert on public.night_roster for insert to authenticated
  with check ((select private.current_app_role()) in ('admin', 'educator'));
create policy night_roster_update on public.night_roster for update to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'))
  with check ((select private.current_app_role()) in ('admin', 'educator'));
create policy night_roster_delete on public.night_roster for delete to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'));

-- Realtime: звіт «Обхід» оновлюється на всіх пристроях (RLS діє й для подій)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='night_roster') then
    alter publication supabase_realtime add table public.night_roster;
  end if;
end $$;
