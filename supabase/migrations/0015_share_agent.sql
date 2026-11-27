-- RE:Aspect · 0015 · shared page shows who shared it (agent name, photo, agency) so the client can reply to them.
create or replace function public.shared_project(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'unit_no', p.unit_no, 'address', p.address,
    'property_type', p.property_type, 'description', p.description,
    'level', p.level, 'size_sqft', p.size_sqft, 'ceiling_cm', p.ceiling_cm,
    'lat', p.lat, 'lon', p.lon, 'plan', p.plan,
    'agent_name', pr.name, 'agent_avatar', pr.avatar, 'agency', a.name)
  from public.projects p
  join public.profiles pr on pr.id = p.owner
  left join public.agencies a on a.id = p.agency
  where p_token ~ '^[0-9a-f]{32}$' and p.share_token = p_token and p.demo_key is null and p.plan is not null
  limit 1
$$;
revoke all on function public.shared_project(text) from public;
grant execute on function public.shared_project(text) to anon, authenticated;
