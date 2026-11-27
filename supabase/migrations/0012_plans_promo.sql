-- RE:Aspect · 0012 · End of the free launch, 3 months of Pro for new users (until 1 Feb 2027), and admin promos.
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live on promotion, after 0011).
--
--   • Limits now follow the real plan: projects Free 1 · Pro 10 · Agency pool · Admin unlimited;
--     AI re-runs per project Free 5 · Pro 25 · Agency 25 · Admin unlimited (+ 40 AI runs per person per day).
--   • Everyone who signs up before 1 Feb 2027 (SGT) gets Pro for 3 months, then drops to Free.
--     Existing Free users get the same 3 months once now, so nobody loses Pro the day the launch ends.
--   • Promo: an admin can give everyone Pro for N days with a message (shown once as a banner). When it ends,
--     everyone is back on their own plan automatically (nothing is changed on their account).

-- ─── 3 months of Pro for new sign-ups until 1 Feb 2027 ─────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, plan, pro_until)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 40),
    case when now() < timestamptz '2027-02-01 00:00:00+08' then 'pro' else 'free' end,
    case when now() < timestamptz '2027-02-01 00:00:00+08' then now() + interval '3 months' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- One-time: existing Free users (not admins) get the same 3 months.
update public.profiles
   set plan = 'pro', pro_until = now() + interval '3 months'
 where plan = 'free' and coalesce(is_admin, false) = false;

-- ─── Promos ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.promos (
  id         uuid primary key default gen_random_uuid(),
  message    text not null check (char_length(message) between 1 and 280 and message !~ '[<>{}\\]'),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.promos enable row level security;   -- functions only
revoke all on public.promos from anon, authenticated;

create or replace function public.promo_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.promos where now() >= starts_at and now() < ends_at)
$$;

-- The running promo (for the banner), or null.
create or replace function public.active_promo() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'message', message, 'endsAt', ends_at)
  from public.promos where now() >= starts_at and now() < ends_at
  order by starts_at desc limit 1
$$;

-- Admin: give everyone Pro for p_days (1–90) from now, with a message. Ends any running promo first.
create or replace function public.admin_start_promo(p_days int, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Days must be 1–90'; end if;
  p_message := btrim(coalesce(p_message, ''));
  if char_length(p_message) = 0 or char_length(p_message) > 280 or p_message ~ '[<>{}\\]' then
    raise exception 'Message: 1–280 characters, no < > { }';
  end if;
  update public.promos set ends_at = now() where now() >= starts_at and now() < ends_at;
  insert into public.promos (message, ends_at, created_by) values (p_message, now() + make_interval(days => p_days), auth.uid());
  return public.active_promo();
end $$;

create or replace function public.admin_end_promo() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.promos set ends_at = now() where now() >= starts_at and now() < ends_at;
end $$;

-- ─── Effective plan (server truth) ─────────────────────────────────────────────────────────
-- 'admin' · 'agency' (active member) · 'pro' (granted and not expired, or a promo is running) · 'free'
create or replace function public.effective_plan(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  pr public.profiles;
begin
  select * into pr from public.profiles where id = p_user;
  if pr.id is null then return 'free'; end if;
  if coalesce(pr.is_admin, false) then return 'admin'; end if;
  if public.my_agency(p_user) is not null then return 'agency'; end if;
  if pr.plan = 'pro' and (pr.pro_until is null or pr.pro_until > now()) then return 'pro'; end if;
  if public.promo_active() then return 'pro'; end if;
  return 'free';
end $$;

-- Project limit: Free 1 · Pro 10 · Agency pool · Admin unlimited (demos never count).
create or replace function public.enforce_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  used int;
  lim int;
  ag uuid;
  eff text;
begin
  if new.demo_key is not null then return new; end if;
  ag := public.my_agency(new.owner);
  if ag is not null then
    new.agency := ag;
    select public.agency_pool(seats) into lim from public.agencies where id = ag;
    select count(*) into used from public.projects where agency = ag and demo_key is null;
    if used >= lim then
      raise exception 'Agency project limit reached (% of %)', used, lim using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.agency := null;
  eff := public.effective_plan(new.owner);
  if eff = 'admin' then return new; end if;
  lim := case eff when 'pro' then 10 else 1 end;
  select count(*) into used from public.projects where owner = new.owner and demo_key is null and agency is null;
  if used >= lim then
    raise exception 'Project limit reached (% of %)', used, lim using errcode = 'P0001';
  end if;
  return new;
end $$;

-- AI re-runs per project: Free 5 · Pro 25 · Agency 25 · Admin unlimited; 40 runs per person per day (admins exempt).
create or replace function public.ai_run_take(p_project uuid, p_fn text, p_user uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  eff text;
  lim int;
  used int;
  today int;
  daily_cap constant int := 40;
begin
  select owner into owner_id from public.projects where id = p_project;
  if owner_id is null or owner_id <> p_user then raise exception 'Not your project' using errcode = '42501'; end if;
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  eff := public.effective_plan(p_user);
  lim := case eff when 'agency' then 25 when 'pro' then 25 else 5 end;

  insert into public.ai_daily (user_id, day, fn, count) values (p_user, current_date, 'run', 0) on conflict do nothing;
  select count into today from public.ai_daily where user_id = p_user and day = current_date and fn = 'run' for update;
  if eff <> 'admin' and today >= daily_cap then raise exception 'Daily AI limit reached (% today) — try again tomorrow', daily_cap using errcode = 'P0001'; end if;

  insert into public.ai_runs (project, fn, count) values (p_project, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_runs where project = p_project and fn = p_fn for update;
  if eff <> 'admin' and used >= lim then raise exception 'AI limit reached for this project (% of %)', used, lim using errcode = 'P0001'; end if;

  update public.ai_daily set count = count + 1 where user_id = p_user and day = current_date and fn = 'run';
  update public.ai_runs set count = count + 1, last_at = now() where project = p_project and fn = p_fn;
  return case when eff = 'admin' then 2147483647 else lim - used - 1 end;
end $$;

-- ─── Grants ────────────────────────────────────────────────────────────────────────────────
revoke all on function public.promo_active(), public.active_promo(), public.admin_start_promo(int, text),
  public.admin_end_promo(), public.effective_plan(uuid), public.ai_run_take(uuid, text, uuid) from public, anon;
revoke all on function public.effective_plan(uuid), public.ai_run_take(uuid, text, uuid), public.promo_active() from authenticated;
grant execute on function public.active_promo(), public.admin_start_promo(int, text), public.admin_end_promo() to authenticated;
grant execute on function public.ai_run_take(uuid, text, uuid), public.effective_plan(uuid) to service_role;
