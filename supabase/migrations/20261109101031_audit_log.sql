-- Append-only audit log, written by triggers; readable by admin only.

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,                         -- auth.uid() at the time (NULL = system / SQL editor / service role)
  action     text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id  uuid,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_admin()));

-- Generic row-change logger. student_medical logs only field names, never health values.
create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_details jsonb;
  v_id uuid;
  v_sensitive boolean := (tg_table_name = 'student_medical');
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_id := (v_new ->> 'id')::uuid;
    if v_sensitive then
      select jsonb_build_object('sensitive', true, 'fields', coalesce(jsonb_agg(key), '[]'::jsonb))
        into v_details from jsonb_each(v_new) where value <> 'null'::jsonb and key not in ('id', 'created_at', 'updated_at');
    else
      v_details := jsonb_build_object('new', v_new);
    end if;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id := (v_new ->> 'id')::uuid;
    if v_sensitive then
      select jsonb_build_object('sensitive', true, 'changed_fields', jsonb_agg(n.key))
        into v_details
        from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
       where n.value is distinct from o.value and n.key <> 'updated_at';
    else
      select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
        into v_details
        from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
       where n.value is distinct from o.value and n.key <> 'updated_at';
    end if;
    if v_details is null then
      return null;                         -- nothing but updated_at changed
    end if;
  else
    v_old := to_jsonb(old);
    v_id := (v_old ->> 'id')::uuid;
    v_details := case when v_sensitive then jsonb_build_object('sensitive', true)
                      else jsonb_build_object('old', v_old) end;
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_details);
  return null;
end $$;
revoke all on function private.audit_row_change() from public, anon, authenticated;

create trigger audit_student_profiles after insert or update or delete on public.student_profiles
  for each row execute function private.audit_row_change();
create trigger audit_student_medical after insert or update or delete on public.student_medical
  for each row execute function private.audit_row_change();
create trigger audit_room_assignments after insert or update or delete on public.room_assignments
  for each row execute function private.audit_row_change();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();
