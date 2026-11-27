-- RE:Aspect · 0009 · Admins get unlimited AI re-runs (per project) and unlimited daily AI checks (e.g. detect-north).
-- Runs are still counted. Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live on promotion, after 0008).

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
begin
  select owner into owner_id from public.projects where id = p_project;
  if owner_id is null or owner_id <> p_user then raise exception 'Not your project' using errcode = '42501'; end if;
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  select plan, pro_until, coalesce(is_admin, false) into plan_id, until, admin from public.profiles where id = p_user;
  if plan_id = 'pro' and until is not null and until < now() then plan_id := 'free'; end if;
  if public.my_agency(p_user) is not null then plan_id := 'agency'; end if;
  lim := case plan_id when 'agency' then 5 when 'pro' then 3 else 3 /* launch: free = pro */ end;
  insert into public.ai_runs (project, fn, count) values (p_project, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_runs where project = p_project and fn = p_fn for update;
  if not admin and used >= lim then raise exception 'AI limit reached for this project (% of %)', used, lim using errcode = 'P0001'; end if;
  update public.ai_runs set count = count + 1, last_at = now() where project = p_project and fn = p_fn;
  return case when admin then 2147483647 else lim - used - 1 end;
end $$;

create or replace function public.ai_daily_take(p_user uuid, p_fn text, p_limit int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  used int;
  admin boolean;
begin
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  select coalesce(is_admin, false) into admin from public.profiles where id = p_user;
  insert into public.ai_daily (user_id, day, fn, count) values (p_user, current_date, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_daily where user_id = p_user and day = current_date and fn = p_fn for update;
  if not admin and used >= p_limit then raise exception 'Daily AI limit reached — try again tomorrow' using errcode = 'P0001'; end if;
  update public.ai_daily set count = count + 1 where user_id = p_user and day = current_date and fn = p_fn;
  return case when admin then 2147483647 else p_limit - used - 1 end;
end $$;

revoke all on function public.ai_run_take(uuid, text, uuid), public.ai_daily_take(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ai_run_take(uuid, text, uuid), public.ai_daily_take(uuid, text, int) to service_role;
