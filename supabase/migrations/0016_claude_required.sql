-- RE:Aspect · 0016 — Claude is required for wall tracing and north detection; AI usage log.
-- Run in the Supabase SQL editor (test first, live on promotion). Safe to run twice.

-- 1. The key for one provider: the active one if it is that provider, else the newest key of that provider.
--    Server functions only (service role) — the browser never sees a key.
create or replace function public.ai_key_for(p_provider text)
returns table (provider text, api_key text)
language sql stable security definer set search_path = '' as $$
  select k.provider, s.decrypted_secret
  from public.ai_keys k join vault.decrypted_secrets s on s.id = k.secret_id
  where k.provider = p_provider
  order by k.active desc, k.created_at desc
  limit 1
$$;
revoke all on function public.ai_key_for(text) from public, anon, authenticated;
grant execute on function public.ai_key_for(text) to service_role;

-- 2. What every AI call cost, from the token counts Claude reports back (so the admin can see real spend;
--    Anthropic has no balance API for individual organisations).
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  fn text not null check (char_length(fn) <= 40),          -- 'detect-north' · 'process-project' · 'key-check'
  model text not null check (char_length(model) <= 60),
  in_tok integer not null default 0,
  out_tok integer not null default 0,
  cache_read integer not null default 0,
  cache_write integer not null default 0,
  usd numeric(10, 6) not null default 0,
  ms integer
);
create index if not exists ai_usage_at on public.ai_usage (at desc);
alter table public.ai_usage enable row level security; -- no policies: only the service role writes; admins read via the function below

-- 3. Admin summary: spend and call counts per function, today / last 7 days / this month / all time.
create or replace function public.admin_ai_usage_summary()
returns table (fn text, period text, calls bigint, usd numeric, avg_ms numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
  with p(period, since) as (values
    ('today', date_trunc('day', now() at time zone 'Asia/Singapore') at time zone 'Asia/Singapore'),
    ('7d', now() - interval '7 days'),
    ('month', date_trunc('month', now() at time zone 'Asia/Singapore') at time zone 'Asia/Singapore'),
    ('all', '-infinity'::timestamptz))
  select u.fn, p.period, count(*)::bigint, round(sum(u.usd), 4), round(avg(u.ms))
  from public.ai_usage u join p on u.at >= p.since
  group by u.fn, p.period;
end $$;
revoke all on function public.admin_ai_usage_summary() from public, anon;
grant execute on function public.admin_ai_usage_summary() to authenticated;
