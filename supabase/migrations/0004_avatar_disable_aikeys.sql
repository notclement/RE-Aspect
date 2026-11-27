-- RE:Aspect · 0004 · profile photo, disabling users, admin-managed AI keys (Supabase Vault)
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).

-- ─── Profile photo + disabled flag ─────────────────────────────────────────────────────────
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_shape;
alter table public.profiles add constraint profiles_avatar_shape check (
  avatar is null or (char_length(avatar) <= 16000 and avatar ~ '^data:image/(webp|jpeg);base64,[A-Za-z0-9+/=]+$')
);
alter table public.profiles add column if not exists disabled boolean not null default false;

grant update (name, settings, avatar) on public.profiles to authenticated;

create or replace function public.is_disabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select disabled from public.profiles where id = auth.uid()), false)
$$;

-- Disabled accounts can't change anything.
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id and not disabled)
  with check ((select auth.uid()) = id and not disabled);

drop policy if exists "projects: insert own" on public.projects;
create policy "projects: insert own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner and not (select public.is_disabled()));
drop policy if exists "projects: update own" on public.projects;
create policy "projects: update own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = owner and not (select public.is_disabled()))
  with check ((select auth.uid()) = owner and not (select public.is_disabled()));
drop policy if exists "projects: delete own" on public.projects;
create policy "projects: delete own" on public.projects
  for delete to authenticated using ((select auth.uid()) = owner and not (select public.is_disabled()));

-- ─── Admin: user list (now with photo + disabled) and disable/enable ───────────────────────
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (id uuid, email text, name text, avatar text, plan text, pro_until timestamptz, is_admin boolean,
               disabled boolean, created_at timestamptz, last_sign_in_at timestamptz, project_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.name, p.avatar, p.plan, p.pro_until, p.is_admin, p.disabled, p.created_at,
           u.last_sign_in_at, (select count(*) from public.projects pr where pr.owner = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

-- Disable (or re-enable) an account. Also bans/unbans the sign-in, so a disabled user can't get new sessions.
create or replace function public.admin_set_disabled(target uuid, value boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'You can''t disable your own account'; end if;
  if (select p.is_admin from public.profiles p where p.id = target) then raise exception 'Remove admin rights before disabling an admin'; end if;
  update public.profiles p set disabled = value where p.id = target;
  if not found then raise exception 'No such user'; end if;
  begin
    update auth.users set banned_until = case when value then 'infinity'::timestamptz else null end where id = target;
  exception when others then
    null; -- the profile flag still blocks the app if the auth ban isn't permitted
  end;
  return value;
end $$;

-- ─── AI keys (admin-managed; secrets live in Supabase Vault, never readable by the browser) ──
create table if not exists public.ai_keys (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null check (provider in ('openai', 'anthropic', 'google', 'other')),
  label       text not null check (char_length(label) between 1 and 40 and label !~ '[<>{}\\]'),
  last4       text not null check (char_length(last4) = 4),
  secret_id   uuid not null,                 -- vault.secrets.id
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
create unique index if not exists ai_keys_one_active on public.ai_keys ((true)) where active;
alter table public.ai_keys enable row level security;   -- no policies: no direct access from the app
revoke all on public.ai_keys from anon, authenticated;

create or replace function public.admin_list_ai_keys()
returns table (id uuid, provider text, label text, last4 text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query select k.id, k.provider, k.label, k.last4, k.active, k.created_at from public.ai_keys k order by k.created_at;
end $$;

create or replace function public.admin_add_ai_key(p_provider text, p_label text, p_key text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  kid uuid;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_key is null or char_length(p_key) < 20 or char_length(p_key) > 400 or p_key ~ '\s' then
    raise exception 'That doesn''t look like an API key';
  end if;
  sid := vault.create_secret(p_key, 'ai_key_' || gen_random_uuid()::text, p_provider || ': ' || p_label);
  insert into public.ai_keys (provider, label, last4, secret_id, active, created_by)
    values (p_provider, p_label, right(p_key, 4), sid, not exists (select 1 from public.ai_keys where active), auth.uid())
    returning id into kid;
  return kid;
end $$;

create or replace function public.admin_set_active_ai_key(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if not exists (select 1 from public.ai_keys where id = p_id) then raise exception 'No such key'; end if;
  update public.ai_keys set active = false where active and id <> p_id;
  update public.ai_keys set active = true where id = p_id;
end $$;

create or replace function public.admin_delete_ai_key(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.ai_keys;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into k from public.ai_keys where id = p_id;
  if not found then raise exception 'No such key'; end if;
  delete from public.ai_keys where id = p_id;
  delete from vault.secrets where id = k.secret_id;
  if k.active then
    update public.ai_keys set active = true where id = (select id from public.ai_keys order by created_at desc limit 1);
  end if;
end $$;

-- For edge functions only (service role): the key the admin chose.
create or replace function public.active_ai_key()
returns table (provider text, api_key text)
language sql stable security definer set search_path = '' as $$
  select k.provider, s.decrypted_secret
  from public.ai_keys k join vault.decrypted_secrets s on s.id = k.secret_id
  where k.active limit 1
$$;

revoke all on function public.is_disabled(), public.admin_list_users(), public.admin_set_disabled(uuid, boolean),
  public.admin_list_ai_keys(), public.admin_add_ai_key(text, text, text), public.admin_set_active_ai_key(uuid),
  public.admin_delete_ai_key(uuid), public.active_ai_key() from public, anon;
grant execute on function public.is_disabled(), public.admin_list_users(), public.admin_set_disabled(uuid, boolean),
  public.admin_list_ai_keys(), public.admin_add_ai_key(text, text, text), public.admin_set_active_ai_key(uuid),
  public.admin_delete_ai_key(uuid) to authenticated;
revoke execute on function public.active_ai_key() from authenticated;
grant execute on function public.active_ai_key() to service_role;
