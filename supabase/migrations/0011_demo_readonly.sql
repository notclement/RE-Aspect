-- RE:Aspect · 0011 · Demo projects are read-only for everyone (admins included) and never count toward any quota.
-- The demos live in the app itself; the per-user copies of their details (rows with demo_key) are no longer used.
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live on promotion, after 0010).

-- Old per-user demo copies: remove (they only held edits to demo details, which are no longer possible).
delete from public.projects where demo_key is not null;

-- Nobody can create or change demo rows any more.
create or replace function public.block_demo_writes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.demo_key is not null then
    raise exception 'Demo projects are read-only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists projects_no_demo on public.projects;
create trigger projects_no_demo before insert or update on public.projects
  for each row execute function public.block_demo_writes();

-- Admin user list: project counts exclude demos.
create or replace function public.admin_list_users()
returns table (id uuid, email text, name text, avatar text, plan text, pro_until timestamptz, is_admin boolean,
               disabled boolean, created_at timestamptz, last_sign_in_at timestamptz, project_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.name, p.avatar, p.plan, p.pro_until, p.is_admin, p.disabled, p.created_at,
           u.last_sign_in_at, (select count(*) from public.projects pr where pr.owner = p.id and pr.demo_key is null)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

-- Admin: one user's own projects (no demos).
create or replace function public.admin_list_projects(target uuid)
returns setof public.projects
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query select * from public.projects where owner = target and demo_key is null order by created_at;
end $$;
