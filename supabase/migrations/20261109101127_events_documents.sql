-- Events module and document library (tables + RLS).

-- ---------------------------------------------------------- event_quotas
create table public.event_quotas (
  id               uuid primary key default gen_random_uuid(),
  educator_id      uuid not null references public.profiles (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  required_count   int not null check (required_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (educator_id, academic_year_id)
);
create index event_quotas_academic_year_idx on public.event_quotas (academic_year_id);
create trigger event_quotas_set_updated_at before update on public.event_quotas
  for each row execute function private.set_updated_at();

-- -------------------------------------------------------- event_sessions
create table public.event_sessions (
  id               uuid primary key default gen_random_uuid(),
  educator_id      uuid not null references public.profiles (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  title            text not null,
  held_on          date,
  format           text,
  description      jsonb not null default '{}'::jsonb,   -- structured report
  status           text not null default 'draft' check (status in ('draft', 'held', 'approved')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index event_sessions_educator_idx on public.event_sessions (educator_id);
create index event_sessions_academic_year_idx on public.event_sessions (academic_year_id);
create index event_sessions_held_on_idx on public.event_sessions (held_on);
create trigger event_sessions_set_updated_at before update on public.event_sessions
  for each row execute function private.set_updated_at();

-- helpers for attendance policies
create or replace function private.can_view_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.is_admin()
    or (private.current_app_role() = 'educator'
        and exists (select 1 from public.event_sessions s
                    where s.id = p_session_id and s.educator_id = (select auth.uid()))), false)
$$;
create or replace function private.can_edit_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.is_admin()
    or (private.current_app_role() = 'educator'
        and exists (select 1 from public.event_sessions s
                    where s.id = p_session_id and s.educator_id = (select auth.uid())
                      and s.status <> 'approved')), false)
$$;
revoke all on function private.can_view_session(uuid), private.can_edit_session(uuid) from public, anon;
grant execute on function private.can_view_session(uuid), private.can_edit_session(uuid) to authenticated, service_role;

-- ------------------------------------------------------ event_attendance
create table public.event_attendance (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.event_sessions (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  present        boolean not null default true,
  absence_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, student_id),
  check (not present or absence_reason is null)
);
create index event_attendance_student_idx on public.event_attendance (student_id);
create trigger event_attendance_set_updated_at before update on public.event_attendance
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------ event_plan
create table public.event_plan (
  id                 uuid primary key default gen_random_uuid(),
  planned_date       date not null,
  title              text not null,
  responsible_id     uuid references public.profiles (id) on delete set null,
  notes              text,
  required_documents text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index event_plan_planned_date_idx on public.event_plan (planned_date);
create index event_plan_responsible_idx on public.event_plan (responsible_id);
create trigger event_plan_set_updated_at before update on public.event_plan
  for each row execute function private.set_updated_at();

-- -------------------------------------------------------------- documents
create table public.documents (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  category             text,
  topic                text,
  academic_year_id     uuid references public.academic_years (id) on delete restrict,
  author_id            uuid references public.profiles (id) on delete set null,
  tags                 text[] not null default '{}',
  storage_path         text not null unique,     -- path inside private bucket "documents"
  mime_type            text,
  based_on_document_id uuid references public.documents (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index documents_academic_year_idx on public.documents (academic_year_id);
create index documents_author_idx on public.documents (author_id);
create index documents_based_on_idx on public.documents (based_on_document_id);
create index documents_tags_idx on public.documents using gin (tags);
create trigger documents_set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();

create table public.document_templates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  storage_path text not null unique,
  placeholders jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger document_templates_set_updated_at before update on public.document_templates
  for each row execute function private.set_updated_at();

-- -------------------------------------------------- privileges + policies
alter table public.event_quotas enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_attendance enable row level security;
alter table public.event_plan enable row level security;
alter table public.documents enable row level security;
alter table public.document_templates enable row level security;

revoke all on public.event_quotas, public.event_sessions, public.event_attendance,
  public.event_plan, public.documents, public.document_templates from anon, authenticated;
grant select, insert, update, delete on public.event_quotas, public.event_sessions,
  public.event_attendance, public.event_plan, public.documents, public.document_templates
  to authenticated, service_role;

-- event_quotas: admin manages; educator reads own
create policy event_quotas_select on public.event_quotas for select to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and educator_id = (select auth.uid())));
create policy event_quotas_insert on public.event_quotas for insert to authenticated
  with check ((select private.is_admin()));
create policy event_quotas_update on public.event_quotas for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy event_quotas_delete on public.event_quotas for delete to authenticated
  using ((select private.is_admin()));

-- event_sessions: educator works on own sessions (not once approved); only admin approves
create policy event_sessions_select on public.event_sessions for select to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and educator_id = (select auth.uid())));
create policy event_sessions_insert on public.event_sessions for insert to authenticated
  with check ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and educator_id = (select auth.uid())
             and status in ('draft', 'held')));
create policy event_sessions_update on public.event_sessions for update to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and educator_id = (select auth.uid())
             and status <> 'approved'))
  with check ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and educator_id = (select auth.uid())
             and status in ('draft', 'held')));
create policy event_sessions_delete on public.event_sessions for delete to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and educator_id = (select auth.uid())
             and status = 'draft'));

-- event_attendance: follows the session
create policy event_attendance_select on public.event_attendance for select to authenticated
  using ((select private.can_view_session(session_id)));
create policy event_attendance_insert on public.event_attendance for insert to authenticated
  with check ((select private.can_edit_session(session_id)));
create policy event_attendance_update on public.event_attendance for update to authenticated
  using ((select private.can_edit_session(session_id)))
  with check ((select private.can_edit_session(session_id)));
create policy event_attendance_delete on public.event_attendance for delete to authenticated
  using ((select private.can_edit_session(session_id)));

-- event_plan: admin + educators read; admin writes; responsible educator may update their row
create policy event_plan_select on public.event_plan for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'educator'));
create policy event_plan_insert on public.event_plan for insert to authenticated
  with check ((select private.is_admin()));
create policy event_plan_update on public.event_plan for update to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and responsible_id = (select auth.uid())))
  with check ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and responsible_id = (select auth.uid())));
create policy event_plan_delete on public.event_plan for delete to authenticated
  using ((select private.is_admin()));

-- documents: all active users read; admin/educator add; admin or author edit/delete
create policy documents_select on public.documents for select to authenticated
  using ((select private.is_active_user()));
create policy documents_insert on public.documents for insert to authenticated
  with check ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and author_id = (select auth.uid())));
create policy documents_update on public.documents for update to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and author_id = (select auth.uid())))
  with check ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and author_id = (select auth.uid())));
create policy documents_delete on public.documents for delete to authenticated
  using ((select private.is_admin())
         or ((select private.current_app_role()) = 'educator' and author_id = (select auth.uid())));

-- document_templates: all active users read; admin writes
create policy document_templates_select on public.document_templates for select to authenticated
  using ((select private.is_active_user()));
create policy document_templates_insert on public.document_templates for insert to authenticated
  with check ((select private.is_admin()));
create policy document_templates_update on public.document_templates for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy document_templates_delete on public.document_templates for delete to authenticated
  using ((select private.is_admin()));
