-- RE:Aspect · 0008 · Agencies: lead + members, QR invite code (lead approves), pooled project quota, enquiries
-- Run in Supabase → SQL Editor (re-aspect-test now; re-aspect-live when dev is promoted to main).
--
-- Rules (docs/REQUIREMENTS.md §Agency):
--   • Only an admin makes someone an Agency Lead (admin_set_agency) with N paid seats.
--   • Members = seats + 1 (the lead is on top). Pool = ceil(seats × 10 × 1.25 / 10) × 10 projects.
--   • One reusable invite code per agency (QR); the lead can reset it. Scanning + signing in → Pending; lead approves.
--   • Active members use the agency's pool and Agency limits. Projects made while in the agency belong to the agency:
--     when a member leaves or is removed they move to the lead.
--   • Everyone in the agency sees the team (photo, name, role, projects used). Only the lead sees members' projects.

-- ─── Fix: the edge functions (service role) save traced plans ─────────────────────────────
-- New Supabase projects don't grant table access to service_role by default → "permission denied for table projects".
grant select, update on public.projects to service_role;

-- ─── Tables ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60 and name !~ '[<>{}\\]'),
  lead        uuid not null unique references public.profiles (id) on delete cascade,
  seats       int not null check (seats between 1 and 500),
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
  created_at  timestamptz not null default now()
);

create table if not exists public.agency_members (
  agency    uuid not null references public.agencies (id) on delete cascade,
  member    uuid not null unique references public.profiles (id) on delete cascade, -- one agency per person
  role      text not null default 'member' check (role in ('lead', 'member')),
  status    text not null default 'pending' check (status in ('pending', 'active')),
  joined_at timestamptz not null default now(),
  primary key (agency, member)
);

alter table public.projects add column if not exists agency uuid references public.agencies (id) on delete set null;
create index if not exists projects_agency_idx on public.projects (agency);

create table if not exists public.agency_enquiries (
  id         uuid primary key default gen_random_uuid(),
  author     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  company    text not null check (char_length(company) between 1 and 80 and company !~ '[<>{}\\]'),
  team_size  int not null check (team_size between 1 and 1000),
  phone      text not null default '' check (phone ~ '^[0-9 +()-]{0,20}$'),
  message    text not null default '' check (char_length(message) <= 1000 and message !~ '[<>]'),
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Everything goes through the functions below (security definer). No direct table access.
alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.agency_enquiries enable row level security;
revoke all on public.agencies, public.agency_members, public.agency_enquiries from anon, authenticated;

-- ─── Helpers ───────────────────────────────────────────────────────────────────────────────
create or replace function public.agency_pool(p_seats int) returns int
language sql immutable set search_path = '' as $$
  select (ceil(p_seats * 10 * 1.25 / 10.0) * 10)::int
$$;

create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.agencies where invite_code = code);
  end loop;
  return code;
end $$;

-- The caller's ACTIVE agency (null if none).
create or replace function public.my_agency(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select agency from public.agency_members where member = p_user and status = 'active'
$$;

-- Hand the agency's projects of one person to the lead (leaving / removed).
create or replace function public.agency_hand_over(p_agency uuid, p_member uuid) returns void
language sql security definer set search_path = '' as $$
  update public.projects p set owner = a.lead
  from public.agencies a
  where a.id = p_agency and p.agency = p_agency and p.owner = p_member and p.demo_key is null;
$$;

-- ─── Project limit: agency pool for active members ─────────────────────────────────────────
create or replace function public.enforce_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  used int;
  lim int := 10;
  ag uuid;
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
  select count(*) into used from public.projects where owner = new.owner and demo_key is null and agency is null;
  if used >= lim then
    raise exception 'Project limit reached (% of %)', used, lim using errcode = 'P0001';
  end if;
  return new;
end $$;

-- AI re-runs: active agency members get Agency limits (5).
create or replace function public.ai_run_take(p_project uuid, p_fn text, p_user uuid)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  plan_id text;
  until timestamptz;
  lim int;
  used int;
begin
  select owner into owner_id from public.projects where id = p_project;
  if owner_id is null or owner_id <> p_user then raise exception 'Not your project' using errcode = '42501'; end if;
  if (select disabled from public.profiles where id = p_user) then raise exception 'Account disabled' using errcode = '42501'; end if;
  select plan, pro_until into plan_id, until from public.profiles where id = p_user;
  if plan_id = 'pro' and until is not null and until < now() then plan_id := 'free'; end if;
  if public.my_agency(p_user) is not null then plan_id := 'agency'; end if;
  lim := case plan_id when 'agency' then 5 when 'pro' then 3 else 3 /* launch: free = pro */ end;
  insert into public.ai_runs (project, fn, count) values (p_project, p_fn, 0) on conflict do nothing;
  select count into used from public.ai_runs where project = p_project and fn = p_fn for update;
  if used >= lim then raise exception 'AI limit reached for this project (% of %)', used, lim using errcode = 'P0001'; end if;
  update public.ai_runs set count = count + 1, last_at = now() where project = p_project and fn = p_fn;
  return lim - used - 1;
end $$;

-- ─── Admin ─────────────────────────────────────────────────────────────────────────────────
-- Make `target` an Agency Lead (or change seats / name). p_seats = null removes the agency
-- (members are detached; projects stay with whoever owns them now).
create or replace function public.admin_set_agency(target uuid, p_name text, p_seats int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  ag uuid;
  other uuid;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'No such user'; end if;
  select id into ag from public.agencies where lead = target;

  if p_seats is null then
    if ag is not null then
      update public.projects set agency = null where agency = ag;
      delete from public.agencies where id = ag;
    end if;
    return;
  end if;
  if p_seats < 1 or p_seats > 500 then raise exception 'Seats must be 1–500'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) = 0 or char_length(p_name) > 60 or p_name ~ '[<>{}\\]' then raise exception 'Agency name: 1–60 characters, no < > { } \\'; end if;

  if ag is null then
    select agency into other from public.agency_members where member = target;
    if other is not null then raise exception 'This user is already in another agency — remove them there first'; end if;
    insert into public.agencies (name, lead, seats, invite_code) values (p_name, target, p_seats, public.new_invite_code())
      returning id into ag;
    insert into public.agency_members (agency, member, role, status) values (ag, target, 'lead', 'active');
  else
    if (select count(*) from public.agency_members where agency = ag and status = 'active') > p_seats + 1 then
      raise exception 'More active members than % seats + lead — remove members first', p_seats;
    end if;
    update public.agencies set name = p_name, seats = p_seats where id = ag;
  end if;
end $$;

-- Agency info for every user the admin can see (lead or member).
create or replace function public.admin_agencies()
returns table (member uuid, agency uuid, agency_name text, role text, status text, seats int, members bigint, pool int, used bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select m.member, a.id, a.name, m.role, m.status, a.seats,
           (select count(*) from public.agency_members x where x.agency = a.id and x.status = 'active'),
           public.agency_pool(a.seats),
           (select count(*) from public.projects p where p.agency = a.id and p.demo_key is null)
    from public.agency_members m join public.agencies a on a.id = m.agency;
end $$;

create or replace function public.admin_list_enquiries()
returns table (id uuid, author uuid, name text, email text, company text, team_size int, phone text, message text, handled boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select e.id, e.author, p.name, u.email::text, e.company, e.team_size, e.phone, e.message, e.handled, e.created_at
    from public.agency_enquiries e join public.profiles p on p.id = e.author join auth.users u on u.id = e.author
    order by e.handled, e.created_at desc;
end $$;

create or replace function public.admin_set_enquiry_handled(p_id uuid, value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.agency_enquiries set handled = value where id = p_id;
end $$;

-- ─── Users ─────────────────────────────────────────────────────────────────────────────────
-- "Contact us for agency rates" — max 3 open enquiries per person.
create or replace function public.agency_enquire(p_company text, p_team_size int, p_phone text, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_disabled() then raise exception 'Please sign in' using errcode = '42501'; end if;
  if (select count(*) from public.agency_enquiries where author = auth.uid() and not handled) >= 3 then
    raise exception 'We already have your enquiry — we''ll be in touch soon.';
  end if;
  insert into public.agency_enquiries (company, team_size, phone, message)
    values (btrim(p_company), p_team_size, btrim(coalesce(p_phone, '')), btrim(coalesce(p_message, '')));
end $$;

-- Everything the "My agency" page needs. Invite code only for the lead; members' projects only for the lead.
create or replace function public.agency_mine() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mrow public.agency_members;
  a public.agencies;
  is_lead boolean;
begin
  if me is null then return null; end if;
  select * into mrow from public.agency_members where member = me;
  if mrow is null then return null; end if;
  select * into a from public.agencies where id = mrow.agency;
  is_lead := mrow.role = 'lead';
  if mrow.status = 'pending' then
    return jsonb_build_object('id', a.id, 'name', a.name, 'role', mrow.role, 'status', 'pending',
      'lead', (select name from public.profiles where id = a.lead));
  end if;
  return jsonb_build_object(
    'id', a.id, 'name', a.name, 'role', mrow.role, 'status', 'active',
    'seats', a.seats, 'memberLimit', a.seats + 1, 'pool', public.agency_pool(a.seats),
    'used', (select count(*) from public.projects p where p.agency = a.id and p.demo_key is null),
    'inviteCode', case when is_lead then a.invite_code end,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.member, 'name', pr.name, 'avatar', pr.avatar, 'role', m.role, 'status', m.status, 'joinedAt', m.joined_at,
        'projects', (select count(*) from public.projects p where p.agency = a.id and p.owner = m.member and p.demo_key is null),
        'projectList', case when is_lead then (
          select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'unitNo', p.unit_no, 'updatedAt', p.updated_at) order by p.updated_at desc), '[]'::jsonb)
          from public.projects p where p.agency = a.id and p.owner = m.member and p.demo_key is null) end
      ) order by (m.role = 'lead') desc, m.status desc, pr.name)
      from public.agency_members m join public.profiles pr on pr.id = m.member
      where m.agency = a.id and (is_lead or m.status = 'active')
    ), '[]'::jsonb)
  );
end $$;

-- Look up an invite code (shown before asking to join).
create or replace function public.agency_peek(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.agencies;
begin
  if auth.uid() is null then raise exception 'Please sign in' using errcode = '42501'; end if;
  select * into a from public.agencies where invite_code = upper(btrim(p_code));
  if a is null then return null; end if;
  return jsonb_build_object('id', a.id, 'name', a.name, 'lead', (select name from public.profiles where id = a.lead));
end $$;

-- Scan → sign in → request to join (Pending until the lead approves).
create or replace function public.agency_join(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  a public.agencies;
  cur public.agency_members;
begin
  if me is null or public.is_disabled() then raise exception 'Please sign in' using errcode = '42501'; end if;
  select * into a from public.agencies where invite_code = upper(btrim(p_code));
  if a is null then raise exception 'This invite code isn''t valid any more — ask your agency lead for a new QR code.'; end if;
  select * into cur from public.agency_members where member = me;
  if cur is not null then
    if cur.agency = a.id then return jsonb_build_object('status', cur.status, 'name', a.name); end if;
    raise exception 'You''re already in another agency. Leave it first (My agency → Leave).';
  end if;
  insert into public.agency_members (agency, member, role, status) values (a.id, me, 'member', 'pending');
  return jsonb_build_object('status', 'pending', 'name', a.name);
end $$;

-- Lead actions. p_action: 'approve' | 'remove' (remove also declines a pending request).
create or replace function public.agency_member(p_user uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ag uuid;
  a public.agencies;
begin
  select id into ag from public.agencies where lead = auth.uid();
  if ag is null or public.is_disabled() then raise exception 'Agency leads only' using errcode = '42501'; end if;
  select * into a from public.agencies where id = ag;
  if p_user = a.lead then raise exception 'The lead can''t be removed'; end if;
  if not exists (select 1 from public.agency_members where agency = ag and member = p_user) then raise exception 'Not in your agency'; end if;
  if p_action = 'approve' then
    if (select count(*) from public.agency_members where agency = ag and status = 'active') >= a.seats + 1 then
      raise exception 'All % seats are taken — remove someone or contact us for more seats.', a.seats;
    end if;
    update public.agency_members set status = 'active', joined_at = now() where agency = ag and member = p_user;
  elsif p_action = 'remove' then
    perform public.agency_hand_over(ag, p_user);
    delete from public.agency_members where agency = ag and member = p_user;
  else
    raise exception 'Unknown action';
  end if;
end $$;

-- Lead: new invite code (old QR codes stop working) / rename.
create or replace function public.agency_reset_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text := public.new_invite_code();
begin
  update public.agencies set invite_code = code where lead = auth.uid() and not public.is_disabled();
  if not found then raise exception 'Agency leads only' using errcode = '42501'; end if;
  return code;
end $$;

create or replace function public.agency_rename(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) = 0 or char_length(p_name) > 60 or p_name ~ '[<>{}\\]' then raise exception 'Agency name: 1–60 characters'; end if;
  update public.agencies set name = p_name where lead = auth.uid() and not public.is_disabled();
  if not found then raise exception 'Agency leads only' using errcode = '42501'; end if;
end $$;

-- Member: leave (or cancel a pending request). Agency projects stay with the agency (move to the lead).
create or replace function public.agency_leave() returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.agency_members;
begin
  select * into m from public.agency_members where member = auth.uid();
  if m is null then return; end if;
  if m.role = 'lead' then raise exception 'Leads can''t leave their own agency — contact us to hand it over.'; end if;
  perform public.agency_hand_over(m.agency, m.member);
  delete from public.agency_members where member = m.member;
end $$;

-- ─── Grants ────────────────────────────────────────────────────────────────────────────────
revoke all on function public.agency_pool(int), public.new_invite_code(), public.my_agency(uuid),
  public.agency_hand_over(uuid, uuid), public.admin_set_agency(uuid, text, int), public.admin_agencies(),
  public.admin_list_enquiries(), public.admin_set_enquiry_handled(uuid, boolean), public.agency_enquire(text, int, text, text),
  public.agency_mine(), public.agency_peek(text), public.agency_join(text), public.agency_member(uuid, text),
  public.agency_reset_code(), public.agency_rename(text), public.agency_leave() from public, anon;
revoke all on function public.new_invite_code(), public.my_agency(uuid), public.agency_hand_over(uuid, uuid) from authenticated;
grant execute on function public.agency_pool(int), public.admin_set_agency(uuid, text, int), public.admin_agencies(),
  public.admin_list_enquiries(), public.admin_set_enquiry_handled(uuid, boolean), public.agency_enquire(text, int, text, text),
  public.agency_mine(), public.agency_peek(text), public.agency_join(text), public.agency_member(uuid, text),
  public.agency_reset_code(), public.agency_rename(text), public.agency_leave() to authenticated;
grant execute on function public.my_agency(uuid) to service_role;
