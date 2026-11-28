-- RE:Aspect · 0021 · "Not an agent" (e.g. interior designers): full name still required, no CEA number.
--   Shared pages then say "Sent by <full name> · Interior designer".
alter table public.profiles add column if not exists not_agent boolean not null default false;
grant update (name, settings, avatar, full_name, cea_no, not_agent) on public.profiles to authenticated;

create or replace function public.shared_project(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'unit_no', p.unit_no, 'address', p.address,
    'property_type', p.property_type, 'description', p.description,
    'level', p.level, 'size_sqft', p.size_sqft, 'ceiling_cm', p.ceiling_cm,
    'lat', p.lat, 'lon', p.lon, 'plan', p.plan,
    'agent_name', coalesce(pr.full_name, pr.name),
    'agent_cea', case when pr.not_agent then null else pr.cea_no end,
    'agent_role', case when pr.not_agent then 'designer' else 'agent' end,
    'agent_avatar', pr.avatar, 'agency', a.name)
  from public.projects p
  join public.profiles pr on pr.id = p.owner
  left join public.agencies a on a.id = p.agency
  where p_token ~ '^[0-9a-f]{32}$' and p.share_token = p_token and p.demo_key is null and p.plan is not null
  limit 1
$$;
revoke all on function public.shared_project(text) from public;
grant execute on function public.shared_project(text) to anon, authenticated;
