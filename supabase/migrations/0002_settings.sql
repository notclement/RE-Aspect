-- RE:Aspect · 0002 · per-user settings synced across devices
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).

alter table public.profiles
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Must be a small JSON object (the app also validates and clamps every value it reads).
alter table public.profiles drop constraint if exists profiles_settings_shape;
alter table public.profiles add constraint profiles_settings_shape
  check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 4096);

-- Users may update their own name and settings — nothing else (plan / admin stay server-only).
grant update (name, settings) on public.profiles to authenticated;
