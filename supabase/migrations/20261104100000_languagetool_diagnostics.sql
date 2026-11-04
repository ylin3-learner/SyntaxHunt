alter table public.learning_logs
  add column if not exists source text,
  add column if not exists category text,
  add column if not exists rule_id text;

create index if not exists learning_logs_language_tool_rule_idx
  on public.learning_logs (category, rule_id, created_at desc)
  where source = 'languagetool';

drop table if exists public.diagnosis_cache;
