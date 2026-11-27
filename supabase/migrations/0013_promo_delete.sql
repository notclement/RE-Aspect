-- RE:Aspect · 0013 · Admins can list and delete promos (deleting the running one ends it immediately:
-- everyone is back on their own plan and the banner disappears). Run after 0012.

create or replace function public.admin_list_promos()
returns table (id uuid, message text, starts_at timestamptz, ends_at timestamptz, created_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select p.id, p.message, p.starts_at, p.ends_at, p.created_at, (now() >= p.starts_at and now() < p.ends_at)
    from public.promos p order by p.starts_at desc limit 50;
end $$;

create or replace function public.admin_delete_promo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  delete from public.promos where id = p_id;
end $$;

revoke all on function public.admin_list_promos(), public.admin_delete_promo(uuid) from public, anon;
grant execute on function public.admin_list_promos(), public.admin_delete_promo(uuid) to authenticated;
