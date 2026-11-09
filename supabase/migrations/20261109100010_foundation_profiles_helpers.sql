-- Foundation: private schema, profiles, role helpers, academic years.
-- Helper/trigger functions live in schema "private" (not exposed through the API).
-- Public RPC functions (callable by authenticated) live in "public".

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'staff_readonly'
             check (role in ('admin', 'educator', 'staff_readonly')),
  floor      int check (floor between 2 and 5),
  is_active  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'App users (staff). One row per auth.users row; created by trigger, inactive until an admin activates.';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

-- Role helpers. All return NULL/false for inactive or unknown users.
create or replace function private.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function private.current_floor()
returns int language sql stable security definer set search_path = '' as $$
  select p.floor from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' from public.profiles p
                   where p.id = (select auth.uid()) and p.is_active), false)
$$;

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.is_active)
$$;

revoke all on function private.current_app_role(), private.current_floor(),
  private.is_admin(), private.is_active_user() from public, anon;
grant execute on function private.current_app_role(), private.current_floor(),
  private.is_admin(), private.is_active_user() to authenticated, service_role;

-- New auth user -> inactive staff_readonly profile.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role, floor, is_active)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
          'staff_readonly', null, false)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Defence in depth: API roles can never change role/floor/is_active/id directly.
create or replace function private.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.id is distinct from old.id
          or new.role is distinct from old.role
          or new.floor is distinct from old.floor
          or new.is_active is distinct from old.is_active) then
    raise exception 'FORBIDDEN: role, floor and is_active can only be changed via admin_set_profile()'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.profiles_guard() from public, anon, authenticated;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- Privileges + policies (no INSERT/DELETE for API roles: rows come from the auth trigger / cascade)
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_active_user()));

create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Admin-only way to change role / floor / activation.
create or replace function public.admin_set_profile(
  p_user_id uuid, p_role text, p_floor int, p_is_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN: admin only' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'FORBIDDEN: admins cannot change their own role/activation' using errcode = '42501';
  end if;
  if p_role = 'educator' and p_is_active and p_floor is null then
    raise exception 'INVALID: an active educator needs a floor (2..5)' using errcode = '22023';
  end if;
  update public.profiles
     set role = p_role, floor = p_floor, is_active = p_is_active
   where id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND: profile does not exist' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.admin_set_profile(uuid, text, int, boolean) from public, anon;
grant execute on function public.admin_set_profile(uuid, text, int, boolean) to authenticated;

-- ---------------------------------------------------------- academic_years
create table public.academic_years (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  start_date date not null,
  end_date   date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;
create trigger academic_years_set_updated_at before update on public.academic_years
  for each row execute function private.set_updated_at();

alter table public.academic_years enable row level security;
revoke all on public.academic_years from anon, authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;
grant select, insert, update, delete on public.academic_years to service_role;

create policy academic_years_select on public.academic_years for select to authenticated
  using ((select private.is_active_user()));
create policy academic_years_insert on public.academic_years for insert to authenticated
  with check ((select private.is_admin()));
create policy academic_years_update on public.academic_years for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy academic_years_delete on public.academic_years for delete to authenticated
  using ((select private.is_admin()));

-- Switch the current year atomically (unique index allows only one current).
create or replace function public.set_current_academic_year(p_year_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN: admin only' using errcode = '42501';
  end if;
  perform 1 from public.academic_years where id = p_year_id for update;
  if not found then
    raise exception 'NOT_FOUND: academic year does not exist' using errcode = 'P0002';
  end if;
  update public.academic_years set is_current = false where is_current and id <> p_year_id;
  update public.academic_years set is_current = true where id = p_year_id;
end $$;
revoke all on function public.set_current_academic_year(uuid) from public, anon;
grant execute on function public.set_current_academic_year(uuid) to authenticated;
