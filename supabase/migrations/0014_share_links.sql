-- RE:Aspect · 0014 · read-only share links (no account needed to view)
-- A project gets a random 128-bit token the first time its owner shares it. Anyone with the link can view the
-- unit (plan, sun study, public details) — never notes, owner or anything else. The owner can revoke it.

alter table public.projects add column if not exists share_token text unique
  check (share_token is null or share_token ~ '^[0-9a-f]{32}$');
-- share_token is deliberately NOT in the authenticated column-update grant: only the functions below set it.

-- Owner: get (or create) the share token for one of their projects.
create or replace function public.project_share(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select share_token into tok from public.projects
   where id = p_id and owner = auth.uid() and demo_key is null;
  if not found then raise exception 'Project not found.'; end if;
  if tok is null then
    tok := replace(gen_random_uuid()::text, '-', '');
    update public.projects set share_token = tok where id = p_id and owner = auth.uid();
  end if;
  return tok;
end $$;

-- Owner: turn the link off (old links stop working; sharing again makes a new one).
create or replace function public.project_unshare(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  update public.projects set share_token = null where id = p_id and owner = auth.uid();
end $$;

-- Anyone (also signed out): the public view of a shared project.
create or replace function public.shared_project(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'unit_no', p.unit_no, 'address', p.address,
    'property_type', p.property_type, 'description', p.description,
    'level', p.level, 'size_sqft', p.size_sqft, 'ceiling_cm', p.ceiling_cm,
    'lat', p.lat, 'lon', p.lon, 'plan', p.plan)
  from public.projects p
  where p_token ~ '^[0-9a-f]{32}$' and p.share_token = p_token and p.demo_key is null and p.plan is not null
  limit 1
$$;

revoke all on function public.project_share(uuid) from public, anon;
revoke all on function public.project_unshare(uuid) from public, anon;
revoke all on function public.shared_project(text) from public;
grant execute on function public.project_share(uuid) to authenticated;
grant execute on function public.project_unshare(uuid) to authenticated;
grant execute on function public.shared_project(text) to anon, authenticated;
