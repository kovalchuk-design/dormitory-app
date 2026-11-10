-- Catalogue of professions for the public questionnaire: pupils pick from radio buttons (or "Інша" and type their own),
-- so the same profession is no longer written in many different ways.
--  * read: any active user (the list is not personal data; the public form gets it through the get-questionnaire Edge Function)
--  * write: admin only
--  * student_profiles.profession keeps the chosen NAME as text, so editing/removing a catalogue entry never changes stored answers

create table public.professions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 200),
  sort_order int  not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.professions is 'Profession choices shown as radio buttons in the public questionnaire. Stored answers keep the name as text.';
create unique index professions_name_key on public.professions (lower(btrim(name)));
alter table public.professions enable row level security;
revoke all on public.professions from anon, authenticated;
grant select, insert, update, delete on public.professions to authenticated;
grant select, insert, update, delete on public.professions to service_role;
create policy professions_select on public.professions for select to authenticated
  using ((select private.is_active_user()));
create policy professions_insert on public.professions for insert to authenticated
  with check ((select private.is_admin()));
create policy professions_update on public.professions for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy professions_delete on public.professions for delete to authenticated
  using ((select private.is_admin()));

-- Initial list: the most common spellings already present in approved questionnaires (10+ pupils each).
-- The admin completes / renames the list in the app (Збір анкет → Професії).
insert into public.professions (name, sort_order) values
  ('Перукар (перукар-модельєр), Візажист', 10),
  ('Перукар (перукар-модельєр), Манікюрник', 20),
  ('Перукар (перукар-модельєр)', 30),
  ('Слюсар з ремонту колісних транспортних засобів. Водій автотранспортних засобів (категорія В)', 40),
  ('Слюсар з ремонту колісних транспортних засобів. Водій автотранспортних засобів (категорія В, С)', 50),
  ('Електрогазозварник. Рихтувальник кузовів', 60),
  ('Верстатник широкого профілю', 70),
  ('Електромонтер з ремонту та обслуговування електроустаткування', 80),
  ('Оператор з обробки інформації та програмного забезпечення', 90)
on conflict do nothing;
