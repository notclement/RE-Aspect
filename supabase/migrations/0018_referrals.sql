-- RE:Aspect · 0018 · Referrals by QR: both people get 1 month of Pro
--
--   • Every user has one referral code (8 letters, same alphabet as agency invites), made on first use.
--   • A NEW account (signed up in the last 14 days) can claim one code, once, and never its own.
--   • Both sides get +1 month of Pro, added on top of any Pro time they already have (lifetime stays lifetime).
--   • A referrer earns at most 12 months this way.
--   • Everything goes through security-definer functions; the referrals table has no direct access.

alter table public.profiles add column if not exists ref_code text unique check (ref_code ~ '^[A-HJ-NP-Z2-9]{8}$');

create table if not exists public.referrals (
  referee    uuid primary key references public.profiles (id) on delete cascade,
  referrer   uuid not null references public.profiles (id) on delete cascade,
  rewarded   boolean not null default false,
  created_at timestamptz not null default now(),
  check (referee <> referrer)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer);
alter table public.referrals enable row level security;
revoke all on public.referrals from public, anon, authenticated;

/** +n months of Pro on top of what the user already has. */
create or replace function public.add_pro_months(p_user uuid, p_months int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
     set plan = 'pro',
         pro_until = case
           when p.plan = 'pro' and p.pro_until = 'infinity' then p.pro_until
           when p.plan = 'pro' and p.pro_until is null then p.pro_until          -- no end date already
           else greatest(coalesce(p.pro_until, now()), now()) + make_interval(months => p_months)
         end
   where p.id = p_user;
end $$;

/** The caller's referral code (made on first use), how many people used it and the months earned. */
create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  n int;
  earned int;
begin
  if uid is null then raise exception 'Please sign in again.'; end if;
  select ref_code into code from public.profiles where id = uid;
  if code is null then
    loop
      code := '';
      for i in 1..8 loop code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
      exit when not exists (select 1 from public.profiles where ref_code = code)
            and not exists (select 1 from public.agencies where invite_code = code);
    end loop;
    update public.profiles set ref_code = code where id = uid;
  end if;
  select count(*), count(*) filter (where rewarded) into n, earned from public.referrals where referrer = uid;
  return jsonb_build_object('code', code, 'joined', n, 'months', least(earned, 12));
end $$;

/** Who a code belongs to (first name only), so the invite page can say "Clement invited you". */
create or replace function public.peek_referral(p_code text) returns jsonb
language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('name', split_part(coalesce(nullif(p.name, ''), 'A friend'), ' ', 1))
    from public.profiles p
   where p.ref_code = upper(p_code) and p_code ~* '^[A-HJ-NP-Z2-9]{8}$'
$$;

/** Claim a code for the caller. Returns 'ok', 'own', 'used', 'old' or 'invalid'. */
create or replace function public.claim_referral(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ref uuid;
  joined timestamptz;
  earned int;
begin
  if uid is null then raise exception 'Please sign in again.'; end if;
  if p_code is null or p_code !~* '^[A-HJ-NP-Z2-9]{8}$' then return 'invalid'; end if;
  select id into ref from public.profiles where ref_code = upper(p_code);
  if ref is null then return 'invalid'; end if;
  if ref = uid then return 'own'; end if;
  if exists (select 1 from public.referrals where referee = uid) then return 'used'; end if;
  select created_at into joined from auth.users where id = uid;
  if joined is null or joined < now() - interval '14 days' then return 'old'; end if;

  select count(*) into earned from public.referrals where referrer = ref and rewarded;
  insert into public.referrals (referee, referrer, rewarded) values (uid, ref, earned < 12);
  perform public.add_pro_months(uid, 1);
  if earned < 12 then perform public.add_pro_months(ref, 1); end if;
  return 'ok';
end $$;

/** Admin: referral counts per referrer. */
create or replace function public.admin_referrals()
returns table (referrer uuid, name text, joined bigint, rewarded bigint)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select r.referrer, p.name, count(*), count(*) filter (where r.rewarded)
      from public.referrals r join public.profiles p on p.id = r.referrer
     group by r.referrer, p.name
     order by count(*) desc;
end $$;

revoke all on function public.add_pro_months(uuid, int) from public, anon, authenticated;
revoke all on function public.my_referral(), public.peek_referral(text), public.claim_referral(text), public.admin_referrals() from public, anon;
grant execute on function public.my_referral(), public.peek_referral(text), public.claim_referral(text), public.admin_referrals() to authenticated;
