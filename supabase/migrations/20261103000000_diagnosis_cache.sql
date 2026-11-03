create table if not exists public.diagnosis_cache (
  question_id text not null,
  answer_normalized text not null,
  diagnosis jsonb not null,
  created_at timestamptz not null default now(),
  primary key (question_id, answer_normalized)
);

alter table public.diagnosis_cache enable row level security;

drop policy if exists "Diagnosis cache is readable by students" on public.diagnosis_cache;
create policy "Diagnosis cache is readable by students"
  on public.diagnosis_cache
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.diagnosis_cache from anon, authenticated;
grant select on public.diagnosis_cache to anon, authenticated;

alter table public.learning_logs
  add column if not exists sst text;
