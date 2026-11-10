-- Admin user management: forced password change flag, last-admin guard,
-- service-role-only helpers used by the admin-* Edge Functions, audit "event" action.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
comment on column public.profiles.must_change_password is
  'true → user must set a new password before using the app (temporary password / invite). Cleared by complete_password_change().';

-- audit_log: allow explicit business events (user_created, password_reset, ...). Details never contain secrets.
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'delete', 'event'));

-- The system can never be left without an active admin (defence in depth: also for service_role).
create or replace function private.profiles_keep_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.profiles p
                     where p.id <> old.id and p.role = 'admin' and p.is_active) then
    raise exception 'LAST_ADMIN: the system must keep at least one active admin' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.profiles_keep_admin() from public, anon, authenticated;
create trigger profiles_keep_admin before update or delete on public.profiles
  for each row execute function private.profiles_keep_admin();

-- Clears the forced-change flag for the caller (called by the app after auth.updateUser({password})).
create or replace function public.complete_password_change()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = (select auth.uid());
$$;
revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

-- ---- service_role-only helpers (called from Edge Functions after the JWT/admin check) ----
create or replace function private.assert_active_admin(p_actor uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and is_active) then
    raise exception 'FORBIDDEN: admin only' using errcode = '42501';
  end if;
end $$;
revoke all on function private.assert_active_admin(uuid) from public, anon, authenticated;

-- Applies profile changes with all protective rules; the audit trigger records p_actor as author.
create or replace function public.svc_admin_update_profile(
  p_actor uuid, p_target uuid,
  p_full_name text default null, p_role text default null,
  p_floor int default null, p_set_floor boolean default false,
  p_is_active boolean default null, p_must_change_password boolean default null)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare v_row public.profiles;
begin
  perform private.assert_active_admin(p_actor);
  if p_role is not null and p_role not in ('admin', 'educator', 'staff_readonly') then
    raise exception 'INVALID: unknown role' using errcode = '22023';
  end if;
  if p_set_floor and p_floor is not null and p_floor not between 2 and 5 then
    raise exception 'INVALID: floor must be 2..5' using errcode = '22023';
  end if;
  if p_actor = p_target and ((p_role is not null and p_role <> 'admin') or p_is_active is false) then
    raise exception 'SELF: admins cannot demote or deactivate themselves' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  update public.profiles set
      full_name = coalesce(p_full_name, full_name),
      role = coalesce(p_role, role),
      floor = case when p_set_floor then p_floor else floor end,
      is_active = coalesce(p_is_active, is_active),
      must_change_password = coalesce(p_must_change_password, must_change_password)
    where id = p_target
    returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND: profile does not exist' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

create or replace function public.svc_admin_audit(
  p_actor uuid, p_target uuid, p_event text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values (p_actor, 'event', 'profiles', p_target,
          jsonb_build_object('event', p_event) || coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function public.svc_admin_revoke_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.svc_admin_update_profile(uuid, uuid, text, text, int, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.svc_admin_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.svc_admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.svc_admin_update_profile(uuid, uuid, text, text, int, boolean, boolean, boolean) to service_role;
grant execute on function public.svc_admin_audit(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.svc_admin_revoke_sessions(uuid) to service_role;
grant execute on function private.assert_active_admin(uuid) to service_role;
