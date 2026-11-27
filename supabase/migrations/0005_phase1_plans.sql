-- RE:Aspect · 0005 · Phase 1: traced plans on projects, AI run limits
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).

alter table public.projects add column if not exists plan jsonb;
alter table public.projects add column if not exists status text not null default 'draft';
alter table public.projects add column if not exists level int;
alter table public.projects add column if not exists size_sqft int;
alter table public.projects add column if not exists ceiling_cm int not null default 260;
alter table public.projects add column if not exists lat double precision;
alter table public.projects add column if not exists lon double precision;

alter table public.projects drop constraint if exists projects_phase1_checks;
alter table public.projects add constraint projects_phase1_checks check (
  (plan is null or (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 200000))
  and status in ('draft', 'processing', 'ready', 'failed')
  and (level is null or level between -5 and 200)
  and (size_sqft is null or size_sqft between 50 and 50000)
  and ceiling_cm between 200 and 600
  and (lat is null or lat between -90 and 90)
  and (lon is null or lon between -180 and 180)
);

grant update (demo_key, name, unit_no, address, property_type, description, notes,
              plan, status, level, size_sqft, ceiling_cm, lat, lon) on public.projects to authenticated;

-- ─── AI runs per project & function (Free 1 · Pro 3 · Agency 5 re-runs) ─────────────────────
create table if not exists public.ai_runs (
  project  uuid not null references public.projects (id) on delete cascade,
  fn       text not null check (fn in ('trace', 'furnish')),
  count    int not null default 0,
  last_at  timestamptz not null default now(),
  primary key (project, fn)
);
alter table public.ai_runs enable row level security;
revoke all on public.ai_runs from anon, authenticated;
grant select on public.ai_runs to authenticated;
drop policy if exists "ai_runs: read own" on public.ai_runs;
create policy "ai_runs: read own" on public.ai_runs for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project and p.owner = (select auth.uid())));

-- Called by the process-project edge function (service role) before each AI call.
-- Launch period: Free accounts get Pro's limit (3) — change `lim` for free when payments go live.
create or replace function public.ai_run_take(p_project uuid, p_fn text, p_user uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  plan_id text;
  until timestamptz;
  lim int;
  used int;
begin
  select owner into owner_id from public.projects where id = p_project;
  if owner_id is null or owner_id <> p_user then raise exception 'Not your project' using errcode = '42501'; end if;
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  select plan, pro_until into plan_id, until from public.profiles where id = p_user;
  if plan_id = 'pro' and until is not null and until < now() then plan_id := 'free'; end if;
  lim := case plan_id when 'agency' then 5 when 'pro' then 3 else 3 /* launch: free = pro */ end;
  insert into public.ai_runs (project, fn, count) values (p_project, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_runs where project = p_project and fn = p_fn for update;
  if used >= lim then raise exception 'AI limit reached for this project (% of %)', used, lim using errcode = 'P0001'; end if;
  update public.ai_runs set count = count + 1, last_at = now() where project = p_project and fn = p_fn;
  return lim - used - 1;
end $$;

revoke all on function public.ai_run_take(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_run_take(uuid, text, uuid) to service_role;
