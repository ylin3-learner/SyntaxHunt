# Runtime DB Schemas

### Table: `questions` (client:backup-db.js)
- (inferred via BaaS client query)
- + teacher_id uuid references auth.users(id) default auth.uid()

### Table: `classroom_state` (client:src/composables/useClassroomSync.ts)
- (inferred via BaaS client query)
- + teacher_id uuid references auth.users(id) default auth.uid()

### Table: `learning_logs` (client:src/services/CloudDatabase.ts)
- (inferred via BaaS client query)
- + sst text
- + status text, add column if not exists diagnosis jsonb
- + source text, add column if not exists category text, add column if not exists rule_id text
- + teacher_id uuid references auth.users(id) default auth.uid()
- + seat_code text

### Table: `diagnosis_cache` (supabase/migrations/20261103000000_diagnosis_cache.sql)
- question_id text not null
- answer_normalized text not null
- diagnosis jsonb not null
- created_at timestamptz not null default now()
