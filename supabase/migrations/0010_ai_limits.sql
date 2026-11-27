-- RE:Aspect · 0010 · AI re-runs per project: Free 5 · Pro 25 · Agency 25 · Admin unlimited.
-- Plus a safety cap so one person can't run up the AI bill: 40 AI runs per person per day across all projects
-- (admins exempt). Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live on promotion, after 0009).

alter table public.ai_daily drop constraint if exists ai_daily_fn_check;
alter table public.ai_daily add constraint ai_daily_fn_check check (fn in ('north', 'run'));

create or replace function public.ai_run_take(p_project uuid, p_fn text, p_user uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  plan_id text;
  until timestamptz;
  admin boolean;
  lim int;
  used int;
  today int;
  daily_cap constant int := 40;
begin
  select owner into owner_id from public.projects where id = p_project;
  if owner_id is null or owner_id <> p_user then raise exception 'Not your project' using errcode = '42501'; end if;
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  select plan, pro_until, coalesce(is_admin, false) into plan_id, until, admin from public.profiles where id = p_user;
  if plan_id = 'pro' and until is not null and until < now() then plan_id := 'free'; end if;
  if public.my_agency(p_user) is not null then plan_id := 'agency'; end if;
  lim := case plan_id when 'agency' then 25 when 'pro' then 25 else 5 end;

  -- per person per day (all projects)
  insert into public.ai_daily (user_id, day, fn, count) values (p_user, current_date, 'run', 0) on conflict do nothing;
  select count into today from public.ai_daily where user_id = p_user and day = current_date and fn = 'run' for update;
  if not admin and today >= daily_cap then raise exception 'Daily AI limit reached (% today) — try again tomorrow', daily_cap using errcode = 'P0001'; end if;

  -- per project
  insert into public.ai_runs (project, fn, count) values (p_project, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_runs where project = p_project and fn = p_fn for update;
  if not admin and used >= lim then raise exception 'AI limit reached for this project (% of %)', used, lim using errcode = 'P0001'; end if;

  update public.ai_daily set count = count + 1 where user_id = p_user and day = current_date and fn = 'run';
  update public.ai_runs set count = count + 1, last_at = now() where project = p_project and fn = p_fn;
  return case when admin then 2147483647 else lim - used - 1 end;
end $$;

revoke all on function public.ai_run_take(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_run_take(uuid, text, uuid) to service_role;
