-- Stage 3: Realtime for the rooms board (two educators see each other's moves immediately).
-- RLS still applies to Realtime events (only active users receive them).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_assignments') then
    alter publication supabase_realtime add table public.room_assignments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;
