alter table public.learning_logs
  add column if not exists status text,
  add column if not exists diagnosis jsonb;

create index if not exists learning_logs_pending_status_idx
  on public.learning_logs (status, created_at desc)
  where status = 'PENDING';

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'learning_logs'
  ) then
    execute 'alter publication supabase_realtime add table public.learning_logs';
  end if;
end
$$;
