-- RE:Aspect · 0017 — Admin → AI keys can test any stored key (not only Claude's).
-- Run in the Supabase SQL editor (test first, live on promotion). Safe to run twice.
create or replace function public.ai_key_by_id(p_id uuid)
returns table (provider text, api_key text)
language sql stable security definer set search_path = '' as $$
  select k.provider, s.decrypted_secret
  from public.ai_keys k join vault.decrypted_secrets s on s.id = k.secret_id
  where k.id = p_id
$$;
revoke all on function public.ai_key_by_id(uuid) from public, anon, authenticated;
grant execute on function public.ai_key_by_id(uuid) to service_role;
