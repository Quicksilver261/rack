-- Table: public.leaderboard

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  score integer not null default 0,
  date date not null,
  created_at timestamptz default now()
);

-- Public read: allow anyone to SELECT
alter table public.leaderboard enable row level security;

-- Allow selects for web anon role
create policy "allow_select" on public.leaderboard
  for select using (true);

-- Allow inserts from anon (with basic sanity checks)
create policy "allow_insert" on public.leaderboard
  for insert with check (
    name IS NOT NULL AND length(trim(name)) > 0
    AND score >= 0
    AND date IS NOT NULL
  );

-- Allow updates only when increasing the score for the same name
create policy "allow_update_if_higher" on public.leaderboard
  for update using (true)
  with check (
    -- ensure name not changed
    name = public.leaderboard.name
    AND score >= old.score
  );

-- Deny deletes from anon (require service_role to remove)
create policy "deny_delete" on public.leaderboard
  for delete using (false);

-- Index for fast date-based queries
create index if not exists idx_leaderboard_date_score on public.leaderboard(date, score desc);

-- Notes:
-- 1) These policies assume the Supabase "anon" role is used by clients to insert scores.
-- 2) This does NOT prevent abuse (bots) — consider server-side validation, captcha, or rate-limiting via edge functions.
-- 3) If you prefer to disable direct anon writes, remove the insert policy and use a server-side function with the service_role key.
