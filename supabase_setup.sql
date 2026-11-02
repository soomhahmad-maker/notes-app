-- ============================================
-- Supabase setup for "الملاحظات" (Notes App)
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================

-- 1) Table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text default '',
  color text default 'yellow',
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Enable RLS
alter table public.notes enable row level security;

-- 3) Policies: each user accesses only their own rows
drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes for delete
  using (auth.uid() = user_id);

-- 4) Index for performance
create index if not exists notes_user_id_idx on public.notes(user_id);

-- 4b) Grants (ensure authenticated role can use the table; RLS still enforces per-user access)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select on public.notes to anon;

-- 5) (Optional) auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ============================================
-- After running this SQL:
--   1. If the app still says "Could not find the table public.notes in the
--      schema cache", go to Supabase Dashboard -> Project Settings -> API
--      and click "Reload schema" (or wait ~1 minute for PostgREST to refresh).
--   2. Authentication -> Providers -> Email:
--        Disable "Confirm email" for immediate sign-in (optional).
--   3. Authentication -> URL Configuration:
--        Site URL: https://soomhahmad-maker.github.io/notes-app/
--        Redirect URLs: add the Site URL and http://localhost:8766/
-- ============================================
