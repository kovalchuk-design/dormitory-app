-- Who entered / last changed medical data (visible to everyone who can read student_medical).
-- Values are stamped by a trigger from auth.uid(); clients cannot spoof them.

alter table public.student_medical
  add column created_by uuid references public.profiles (id) on delete set null,
  add column updated_by uuid references public.profiles (id) on delete set null;
create index student_medical_created_by_idx on public.student_medical (created_by);
create index student_medical_updated_by_idx on public.student_medical (updated_by);

create or replace function private.student_medical_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.updated_by := new.created_by;
  else
    new.created_by := old.created_by;
    new.updated_by := (select auth.uid());
  end if;
  return new;
end $$;
revoke all on function private.student_medical_stamp() from public, anon, authenticated;

create trigger student_medical_stamp before insert or update on public.student_medical
  for each row execute function private.student_medical_stamp();
