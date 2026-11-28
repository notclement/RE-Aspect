-- RE:Aspect · 0020 · Every user's full name and CEA licence / registration number, shown on shared pages
--   ("Sent by <full name> · CEA R123456A"). Salesperson registration: R + 6 digits + letter;
--   estate agent licence: L + 7 digits + letter. The user edits both; the checks are repeated here.

alter table public.profiles add column if not exists full_name text
  check (full_name is null or (char_length(full_name) between 2 and 80 and full_name ~ '^[[:alpha:]][[:alpha:] .''-]*$'));
alter table public.profiles add column if not exists cea_no text
  check (cea_no is null or cea_no ~ '^(R[0-9]{6}[A-Z]|L[0-9]{7}[A-Z])$');

grant update (name, settings, avatar, full_name, cea_no) on public.profiles to authenticated;

-- Shared page: who sent it (full name, licence number, photo, agency).
create or replace function public.shared_project(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'unit_no', p.unit_no, 'address', p.address,
    'property_type', p.property_type, 'description', p.description,
    'level', p.level, 'size_sqft', p.size_sqft, 'ceiling_cm', p.ceiling_cm,
    'lat', p.lat, 'lon', p.lon, 'plan', p.plan,
    'agent_name', coalesce(pr.full_name, pr.name), 'agent_cea', pr.cea_no,
    'agent_avatar', pr.avatar, 'agency', a.name)
  from public.projects p
  join public.profiles pr on pr.id = p.owner
  left join public.agencies a on a.id = p.agency
  where p_token ~ '^[0-9a-f]{32}$' and p.share_token = p_token and p.demo_key is null and p.plan is not null
  limit 1
$$;
revoke all on function public.shared_project(text) from public;
grant execute on function public.shared_project(text) to anon, authenticated;
