-- Права на night_roster: у проєкті таблиці отримують GRANT явно (RLS-політики вже обмежують ролі).
grant select, insert, update, delete on public.night_roster to authenticated, service_role;
