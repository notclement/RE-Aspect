-- RE:Aspect · 0003 · projects table, admin panel functions, Pro grants
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).

-- ─── Projects ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  demo_key      text check (demo_key is null or demo_key ~ '^[a-z0-9-]{1,40}$'),  -- set for the built-in demo projects
  name          text not null check (char_length(name) between 1 and 60 and name !~ '[<>{}\\]'),
  unit_no       text not null default '' check (char_length(unit_no) <= 12),
  address       text not null default '' check (char_length(address) <= 120 and address !~ '[<>{}\\]'),
  property_type text not null default 'hdb'
                check (property_type in ('hdb','ec','condo','terrace','semi-d','bungalow','cluster','shophouse','commercial','other')),
  description   text not null default '' check (char_length(description) <= 280 and description !~ '[<>]'),
  notes         text not null default '' check (char_length(notes) <= 2000 and notes !~ '[<>]'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner, demo_key)
);
create index if not exists projects_owner_idx on public.projects (owner);

alter table public.projects enable row level security;

drop policy if exists "projects: read own" on public.projects;
create policy "projects: read own" on public.projects
  for select to authenticated using ((select auth.uid()) = owner);
drop policy if exists "projects: insert own" on public.projects;
create policy "projects: insert own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner);
drop policy if exists "projects: update own" on public.projects;
create policy "projects: update own" on public.projects
  for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
drop policy if exists "projects: delete own" on public.projects;
create policy "projects: delete own" on public.projects
  for delete to authenticated using ((select auth.uid()) = owner);

revoke all on public.projects from anon, authenticated;
grant select, insert, delete on public.projects to authenticated;
grant update (demo_key, name, unit_no, address, property_type, description, notes) on public.projects to authenticated;  -- never owner

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- Plan limit, enforced here (the app only mirrors it). Demo projects never count.
-- Launch period: everyone is treated as Pro (10). Agency pools come with Phase 4.
create or replace function public.enforce_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  used int;
  lim int := 10;
begin
  if new.demo_key is not null then return new; end if;
  select count(*) into used from public.projects where owner = new.owner and demo_key is null;
  if (select plan from public.profiles where id = new.owner) = 'agency' then lim := 100000; end if;
  if used >= lim then
    raise exception 'Project limit reached (% of %)', used, lim using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists projects_limit on public.projects;
create trigger projects_limit before insert on public.projects
  for each row execute function public.enforce_project_limit();

-- ─── Admin ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- All users with email, plan, Pro expiry and project count.
create or replace function public.admin_list_users()
returns table (id uuid, email text, name text, plan text, pro_until timestamptz, is_admin boolean,
               created_at timestamptz, last_sign_in_at timestamptz, project_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.name, p.plan, p.pro_until, p.is_admin, p.created_at, u.last_sign_in_at,
           (select count(*) from public.projects pr where pr.owner = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

-- One user's projects.
create or replace function public.admin_list_projects(target uuid)
returns setof public.projects
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query select * from public.projects where owner = target order by demo_key nulls first, created_at;
end $$;

-- Grant Pro: months = 1..24 adds that many months (from today, or from the current expiry if later);
-- months = null → lifetime; months = 0 → remove Pro. Agency accounts are left alone.
create or replace function public.admin_grant_pro(target uuid, months int)
returns table (plan text, pro_until timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if (select p.plan from public.profiles p where p.id = target) is null then raise exception 'No such user'; end if;
  if (select p.plan from public.profiles p where p.id = target) = 'agency' then raise exception 'Agency accounts are managed separately'; end if;

  if months is null then
    update public.profiles p set plan = 'pro', pro_until = 'infinity' where p.id = target;
  elsif months = 0 then
    update public.profiles p set plan = 'free', pro_until = null where p.id = target;
  elsif months between 1 and 24 then
    update public.profiles p
      set plan = 'pro',
          pro_until = greatest(coalesce(p.pro_until, now()), now()) + make_interval(months => months)
      where p.id = target;
  else
    raise exception 'months must be 1–24, 0 (remove) or null (lifetime)';
  end if;
  return query select p.plan, p.pro_until from public.profiles p where p.id = target;
end $$;

revoke all on function public.is_admin(), public.admin_list_users(), public.admin_list_projects(uuid),
  public.admin_grant_pro(uuid, int) from public, anon;
grant execute on function public.is_admin(), public.admin_list_users(), public.admin_list_projects(uuid),
  public.admin_grant_pro(uuid, int) to authenticated;
