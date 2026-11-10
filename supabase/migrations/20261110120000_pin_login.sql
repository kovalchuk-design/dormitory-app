-- PIN login: 4-digit PIN hashes (server-only), PIN-session marker (no admin rights in such sessions),
-- atomic attempt counter (3 attempts -> locked until an admin unlocks).

create table public.pin_credentials (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_at       timestamptz,
  updated_at      timestamptz not null default now()
);
comment on table public.pin_credentials is 'PBKDF2 hash of the 4-digit PIN. Readable only by service_role (Edge Functions).';
alter table public.pin_credentials enable row level security;
revoke all on public.pin_credentials from anon, authenticated;
grant select, insert, update, delete on public.pin_credentials to service_role;

-- A session created by PIN login is "restricted": never counts as admin, even for an admin account.
create table public.pin_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.pin_sessions enable row level security;
revoke all on public.pin_sessions from anon, authenticated;
grant select, insert, delete on public.pin_sessions to service_role;

create or replace function private.is_pin_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pin_sessions s
                 where s.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid)
$$;
revoke all on function private.is_pin_session() from public, anon;
grant execute on function private.is_pin_session() to authenticated, service_role;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' from public.profiles p
                   where p.id = (select auth.uid()) and p.is_active), false)
         and not private.is_pin_session()
$$;

create or replace function private.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when p.role = 'admin' and private.is_pin_session() then 'educator' else p.role end
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function public.my_session_is_pin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_pin_session()
$$;
revoke all on function public.my_session_is_pin() from public, anon;
grant execute on function public.my_session_is_pin() to authenticated;

-- Atomic attempt reservation (before verifying!): max 3 guesses even with parallel requests.
-- Returns: -1 no PIN set, 0 locked, n>0 = this is attempt number n.
create or replace function public.svc_pin_begin_attempt(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.pin_credentials
     set failed_attempts = failed_attempts + 1, updated_at = now()
   where user_id = p_user and locked_at is null and failed_attempts < 3
   returning failed_attempts into n;
  if found then return n; end if;
  if exists (select 1 from public.pin_credentials where user_id = p_user) then return 0; end if;
  return -1;
end $$;

create or replace function public.svc_pin_fail(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_locked boolean;
begin
  update public.pin_credentials
     set locked_at = case when failed_attempts >= 3 then coalesce(locked_at, now()) else locked_at end
   where user_id = p_user
   returning locked_at is not null into v_locked;
  return coalesce(v_locked, false);
end $$;

create or replace function public.svc_pin_success(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update public.pin_credentials set failed_attempts = 0, updated_at = now()
   where user_id = p_user and locked_at is null;
$$;

revoke all on function public.svc_pin_begin_attempt(uuid), public.svc_pin_fail(uuid), public.svc_pin_success(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_pin_begin_attempt(uuid), public.svc_pin_fail(uuid), public.svc_pin_success(uuid)
  to service_role;
