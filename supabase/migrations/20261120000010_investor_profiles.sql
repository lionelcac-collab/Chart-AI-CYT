-- Investor profile (suitability questionnaire) filled at sign-up; read by the AI to adapt its answers.
create table if not exists investor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null,
  risk_profile text not null check (risk_profile in ('prudent', 'balanced', 'dynamic', 'aggressive')),
  knowledge_level text not null check (knowledge_level in ('beginner', 'intermediate', 'advanced')),
  risk_score int, knowledge_score int,
  updated_at timestamptz not null default now()
);
alter table investor_profiles enable row level security;
create policy "own investor profile" on investor_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
