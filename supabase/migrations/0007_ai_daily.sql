-- RE:Aspect · 0007 · per-user daily limits for AI helpers that run before a project exists (e.g. detect-north)
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).
create table if not exists public.ai_daily (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default current_date,
  fn       text not null check (fn in ('north')),
  count    int not null default 0,
  primary key (user_id, day, fn)
);
alter table public.ai_daily enable row level security;   -- no policies: server functions only
revoke all on public.ai_daily from anon, authenticated;

create or replace function public.ai_daily_take(p_user uuid, p_fn text, p_limit int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  used int;
begin
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  insert into public.ai_daily (user_id, day, fn, count) values (p_user, current_date, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_daily where user_id = p_user and day = current_date and fn = p_fn for update;
  if used >= p_limit then raise exception 'Daily AI limit reached — try again tomorrow' using errcode = 'P0001'; end if;
  update public.ai_daily set count = count + 1 where user_id = p_user and day = current_date and fn = p_fn;
  return p_limit - used - 1;
end $$;

revoke all on function public.ai_daily_take(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ai_daily_take(uuid, text, int) to service_role;
