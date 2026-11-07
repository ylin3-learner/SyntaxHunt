-- 為 questions、learning_logs、classroom_state 新增 teacher_id（UUID REFERENCES auth.users(id)，預設 auth.uid()）
-- 為 learning_logs 新增 seat_code TEXT
-- 為上述三個表啟用 RLS，並建立 auth.uid() = teacher_id 的存取 Policy

alter table public.questions
  add column if not exists teacher_id uuid references auth.users(id) default auth.uid();

alter table public.learning_logs
  add column if not exists teacher_id uuid references auth.users(id) default auth.uid();

alter table public.classroom_state
  add column if not exists teacher_id uuid references auth.users(id) default auth.uid();

alter table public.learning_logs
  add column if not exists seat_code text;

alter table public.questions enable row level security;
alter table public.learning_logs enable row level security;
alter table public.classroom_state enable row level security;

drop policy if exists "Teacher can manage own rows" on public.questions;
create policy "Teacher can manage own rows"
  on public.questions
  for all
  to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

drop policy if exists "Teacher can manage own rows" on public.learning_logs;
create policy "Teacher can manage own rows"
  on public.learning_logs
  for all
  to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

drop policy if exists "Teacher can manage own rows" on public.classroom_state;
create policy "Teacher can manage own rows"
  on public.classroom_state
  for all
  to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
