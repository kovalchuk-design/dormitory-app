-- One-time personal links for pupils. Only the SHA-256 hash of the token is stored.
-- Future public Edge Function (service role) validates: token_hash = sha256(token)
--   AND used_at IS NULL AND expires_at > now(), then sets used_at atomically
--   (UPDATE ... WHERE used_at IS NULL RETURNING) and inserts a pending student_profiles version.

create table public.update_requests (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.students (id) on delete cascade,
  token_hash           text not null unique,
  kind                 text not null check (kind in ('annual', 'update')),
  expires_at           timestamptz not null,
  used_at              timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  resulting_profile_id uuid references public.student_profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  check (expires_at >= created_at)
);
create index update_requests_student_id_idx on public.update_requests (student_id);
create index update_requests_created_by_idx on public.update_requests (created_by);
create index update_requests_resulting_profile_idx on public.update_requests (resulting_profile_id);
create index update_requests_open_idx on public.update_requests (expires_at) where used_at is null;

alter table public.update_requests enable row level security;
revoke all on public.update_requests from anon, authenticated;
-- token_hash is deliberately NOT selectable by API users (name columns explicitly; select('*') will be denied)
grant select (id, student_id, kind, expires_at, used_at, created_by, resulting_profile_id, created_at)
  on public.update_requests to authenticated;
grant delete on public.update_requests to authenticated;
grant select, insert, update, delete on public.update_requests to service_role;

create policy update_requests_select on public.update_requests for select to authenticated
  using ((select private.can_edit_student(student_id)));
create policy update_requests_delete on public.update_requests for delete to authenticated
  using ((select private.is_admin()));

create or replace function public.create_update_request(
  p_student_id uuid, p_kind text, p_ttl_days int default 14)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_token text;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  if p_kind not in ('annual', 'update') then
    raise exception 'INVALID: kind must be annual or update' using errcode = '22023';
  end if;
  if p_ttl_days is null or p_ttl_days < 1 or p_ttl_days > 60 then
    raise exception 'INVALID: ttl_days must be 1..60' using errcode = '22023';
  end if;
  select s.status into v_status from public.students s where s.id = p_student_id;
  if not found then raise exception 'NOT_FOUND: student' using errcode = 'P0002'; end if;
  if v_status <> 'active' then
    raise exception 'STUDENT_NOT_ACTIVE: student status is %', v_status using errcode = '23514';
  end if;
  if not private.can_edit_student(p_student_id) then
    raise exception 'FORBIDDEN: pupil is not on your floor' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.update_requests (student_id, token_hash, kind, expires_at, created_by)
  values (p_student_id,
          encode(extensions.digest(v_token, 'sha256'), 'hex'),
          p_kind,
          now() + make_interval(days => p_ttl_days),
          (select auth.uid()));
  return v_token;   -- the only moment the raw token exists
end $$;
revoke all on function public.create_update_request(uuid, text, int) from public, anon;
grant execute on function public.create_update_request(uuid, text, int) to authenticated;

create or replace function public.revoke_update_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_student uuid;
begin
  if private.current_app_role() is null or private.current_app_role() not in ('admin', 'educator') then
    raise exception 'FORBIDDEN: admin or educator only' using errcode = '42501';
  end if;
  select student_id into v_student from public.update_requests where id = p_request_id;
  if not found then raise exception 'NOT_FOUND: request' using errcode = 'P0002'; end if;
  if not private.can_edit_student(v_student) then
    raise exception 'FORBIDDEN: pupil is not on your floor' using errcode = '42501';
  end if;
  update public.update_requests
     set expires_at = least(expires_at, now())
   where id = p_request_id and used_at is null;
end $$;
revoke all on function public.revoke_update_request(uuid) from public, anon;
grant execute on function public.revoke_update_request(uuid) to authenticated;
