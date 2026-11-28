-- RE:Aspect · 0019 · Stripe payments (test mode first): Pro S$50/month, extra projects S$5 one-off
--
--   • Only the stripe-webhook edge function (service role) changes plans after a payment; the browser never can.
--   • Every Stripe event is recorded once (idempotent): replays and retries do nothing.
--   • Pro from Stripe sets pro_until to the end of the paid period (+3 days' grace for late renewals).
--   • Extra projects add to the Pro limit: 10 + extra_projects.

alter table public.profiles add column if not exists stripe_customer text unique check (stripe_customer ~ '^cus_[A-Za-z0-9]{6,40}$');
alter table public.profiles add column if not exists extra_projects int not null default 0 check (extra_projects between 0 and 1000);

create table if not exists public.payments (
  event_id   text primary key check (event_id ~ '^evt_[A-Za-z0-9]{6,60}$'),
  user_id    uuid references public.profiles (id) on delete set null,
  kind       text not null check (kind in ('pro', 'project', 'renewal', 'cancel', 'other')),
  amount     int,           -- in cents
  currency   text check (currency ~ '^[a-z]{3}$'),
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id);
alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated;
grant select, insert, delete on public.payments to service_role;
grant select, update on public.profiles to service_role;

/** Webhook: record an event once. Returns false if it was already handled. */
create or replace function public.stripe_record(p_event text, p_user uuid, p_kind text, p_amount int, p_currency text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.payments (event_id, user_id, kind, amount, currency) values (p_event, p_user, p_kind, p_amount, lower(p_currency));
  return true;
exception when unique_violation then
  return false;
end $$;

/** Webhook: Pro paid until p_until (end of the period). Never shortens lifetime / admin-granted Pro. */
create or replace function public.stripe_set_pro(p_user uuid, p_customer text, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
     set plan = 'pro',
         stripe_customer = coalesce(p_customer, p.stripe_customer),
         pro_until = case
           when p.plan = 'pro' and (p.pro_until is null or p.pro_until = 'infinity') then p.pro_until
           else greatest(coalesce(p.pro_until, now()), p_until + interval '3 days')
         end
   where p.id = p_user;
end $$;

/** Webhook: n extra projects bought. */
create or replace function public.stripe_add_projects(p_user uuid, p_n int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set extra_projects = least(1000, extra_projects + greatest(0, least(p_n, 100))) where id = p_user;
end $$;

-- Project limit: Free 1 · Pro 10 + extra projects bought · Agency pool · Admin unlimited (demos never count).
create or replace function public.enforce_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  used int;
  lim int;
  ag uuid;
  eff text;
  extra int;
begin
  if new.demo_key is not null then return new; end if;
  ag := public.my_agency(new.owner);
  if ag is not null then
    new.agency := ag;
    select public.agency_pool(seats) into lim from public.agencies where id = ag;
    select count(*) into used from public.projects where agency = ag and demo_key is null;
    if used >= lim then
      raise exception 'Agency project limit reached (% of %)', used, lim using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.agency := null;
  eff := public.effective_plan(new.owner);
  if eff = 'admin' then return new; end if;
  select coalesce(extra_projects, 0) into extra from public.profiles where id = new.owner;
  lim := case eff when 'pro' then 10 + extra else 1 end;
  select count(*) into used from public.projects where owner = new.owner and demo_key is null and agency is null;
  if used >= lim then
    raise exception 'Project limit reached (% of %)', used, lim using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.stripe_record(text, uuid, text, int, text), public.stripe_set_pro(uuid, text, timestamptz), public.stripe_add_projects(uuid, int) from public, anon, authenticated;
grant execute on function public.stripe_record(text, uuid, text, int, text), public.stripe_set_pro(uuid, text, timestamptz), public.stripe_add_projects(uuid, int) to service_role;
