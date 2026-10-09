-- Tatry: the online part of the app (Supabase / Postgres).
-- Paste the whole file into Supabase: SQL Editor -> New query -> Run. Safe to run again (idempotent).
--
-- What is here:
--   profiles        a hiker's public face: name, avatar, a few totals
--   walks, peaks    the journal, synced between the person's devices (visible only to them)
--   groups          hiking groups; joined with an invite code (join_group)
--   group_members   who is in which group
--   group_routes    routes planned together in a group (the planner's #r=... address)
--   messages        the group chat
--   live_positions  where the members are right now: only during a walk, only for their group, and they expire
--   discoveries     the plants, animals, places and challenges found (points), for the rankings
--
-- Privacy by default: nothing is public. A profile is seen by the people in your groups (and by everyone
-- only if you set profiles.public). Positions are seen only by your group and only until expires_at.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default 'Turysta' check (char_length(name) between 1 and 40),
  avatar      text check (char_length(avatar) <= 200000),     -- an emoji or a small image (data URL / storage URL)
  public      boolean not null default false,
  km          real not null default 0,
  ascent      integer not null default 0,
  peaks       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.walks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  route_key   text,
  title       text check (char_length(title) <= 200),
  walked_on   date not null default current_date,
  dist_m      integer not null default 0,
  ascent_m    integer not null default 0,
  time_s      integer not null default 0,
  gps         boolean not null default false,
  completed   boolean not null default false,
  hash        text check (char_length(hash) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists walks_user on public.walks (user_id, walked_on desc);

create table if not exists public.peaks (
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null check (char_length(name) <= 100),
  ele         integer,
  reached_on  date not null default current_date,
  primary key (user_id, name)
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  owner       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);

create table if not exists public.group_routes (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  title       text not null check (char_length(title) <= 200),
  hash        text not null check (char_length(hash) <= 2000),
  starts_at   timestamptz,
  created_by  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists messages_group on public.messages (group_id, created_at desc);

create table if not exists public.live_positions (
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  lat         double precision not null check (lat between 48.5 and 50),
  lon         double precision not null check (lon between 19 and 21),
  alt         real,
  accuracy    real,
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '12 hours',
  primary key (user_id, group_id)
);

create table if not exists public.discoveries (
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  item_id     text not null check (char_length(item_id) <= 160),   -- species id, 'peak:Rysy', 'event:week:2026-W40'
  found_on    date not null default current_date,
  gps         boolean not null default false,                        -- on the real trail (GPS) or in the 3D view
  points      integer not null default 0 check (points between 0 and 1000),
  primary key (user_id, item_id)
);
create index if not exists discoveries_date on public.discoveries (found_on);
alter table public.profiles add column if not exists points integer not null default 0;
alter table public.profiles add column if not exists species integer not null default 0;
-- the figure's look from the planner's editor (sex, hair, clothes, gear: a small JSON object)
alter table public.profiles add column if not exists look jsonb check (pg_column_size(look) <= 4000);

-- ---------------------------------------------------------------- helpers (security definer: no recursive policies)
create or replace function public.is_member(g uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from group_members where group_id = g and user_id = auth.uid()) $$;

create or replace function public.shares_group(other uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from group_members a join group_members b on a.group_id = b.group_id
                    where a.user_id = auth.uid() and b.user_id = other) $$;

-- join a group with its invite code; returns the group id
create or replace function public.join_group(code text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into g from groups where invite_code = code;
  if g is null then raise exception 'no such group'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;

-- the creator of a group becomes its owner member
create or replace function public.on_group_created() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.owner, 'owner') on conflict do nothing;
  return new;
end $$;
drop trigger if exists group_created on public.groups;
create trigger group_created after insert on public.groups for each row execute function public.on_group_created();

-- a profile for every new account
create or replace function public.on_user_created() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Turysta'))
    on conflict do nothing;
  return new;
end $$;
drop trigger if exists user_created on auth.users;
create trigger user_created after insert on auth.users for each row execute function public.on_user_created();

-- rankings: the people who show their profile publicly (and yourself), by points over a period
-- (all, year, month, week, day) and mode (all, gps: on the real trail, 3d: in the 3D view)
create or replace function public.leaderboard(period text default 'all', mode text default 'all')
  returns table (name text, avatar text, points bigint, species bigint, me boolean)
  language sql stable security definer set search_path = public as $$
  select p.name, p.avatar, sum(d.points)::bigint, count(*) filter (where d.item_id not like '%:%')::bigint, p.id = auth.uid()
  from discoveries d join profiles p on p.id = d.user_id
  where (p.public or p.id = auth.uid())
    and d.found_on >= case period
      when 'day' then current_date
      when 'week' then date_trunc('week', current_date)::date
      when 'month' then date_trunc('month', current_date)::date
      when 'year' then date_trunc('year', current_date)::date
      else '1900-01-01'::date end
    and (mode = 'all' or (mode = 'gps') = d.gps)
  group by p.id, p.name, p.avatar
  order by 3 desc
  limit 50 $$;

-- test reports from the 🐞 button: a description, a screenshot (JPEG data URL) and where it happened
-- (route, position, device, recent errors). Anyone using the app may add one; they are readable for 60
-- days (tools/bug_reports.py). No e-mail or account id is stored.
create table if not exists public.bug_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  app         text not null check (app in ('3d', 'planer')),
  description text not null check (char_length(description) between 1 and 4000),
  context     jsonb not null default '{}'::jsonb check (pg_column_size(context) < 60000),
  screenshot  text check (char_length(screenshot) < 1200000)
);
alter table public.bug_reports enable row level security;
drop policy if exists bug_reports_add on public.bug_reports;
create policy bug_reports_add on public.bug_reports for insert to anon, authenticated with check (true);
drop policy if exists bug_reports_read on public.bug_reports;
create policy bug_reports_read on public.bug_reports for select to anon, authenticated using (created_at > now() - interval '60 days');
grant select, insert on public.bug_reports to anon, authenticated;

-- deleting one's own account (the "Usuń konto i dane" button): the user and, through the cascades,
-- everything of theirs: profile, walks, peaks, discoveries, the groups they own (with their routes and
-- chat), memberships, messages, shared positions. No service key needed in the app.
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
do $$ begin revoke all on function public.delete_my_account() from anon; exception when undefined_object then null; end $$;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles       enable row level security;
alter table public.walks          enable row level security;
alter table public.peaks          enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.group_routes   enable row level security;
alter table public.messages       enable row level security;
alter table public.live_positions enable row level security;
alter table public.discoveries    enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public or public.shares_group(id));
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists walks_own on public.walks;
create policy walks_own on public.walks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists peaks_own on public.peaks;
create policy peaks_own on public.peaks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select using (owner = auth.uid() or public.is_member(id));
drop policy if exists groups_create on public.groups;
create policy groups_create on public.groups for insert with check (owner = auth.uid());
drop policy if exists groups_owner on public.groups;
create policy groups_owner on public.groups for update using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete using (owner = auth.uid());

drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members for select using (public.is_member(group_id));
drop policy if exists members_leave on public.group_members;
create policy members_leave on public.group_members for delete
  using (user_id = auth.uid() or exists (select 1 from public.groups g where g.id = group_id and g.owner = auth.uid()));

drop policy if exists routes_read on public.group_routes;
create policy routes_read on public.group_routes for select using (public.is_member(group_id));
drop policy if exists routes_add on public.group_routes;
create policy routes_add on public.group_routes for insert with check (public.is_member(group_id) and created_by = auth.uid());
drop policy if exists routes_remove on public.group_routes;
create policy routes_remove on public.group_routes for delete using (created_by = auth.uid());

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select using (public.is_member(group_id));
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert with check (public.is_member(group_id) and user_id = auth.uid());
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete using (user_id = auth.uid());

drop policy if exists discoveries_own on public.discoveries;
create policy discoveries_own on public.discoveries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists positions_read on public.live_positions;
create policy positions_read on public.live_positions for select
  using (public.is_member(group_id) and expires_at > now());
drop policy if exists positions_write on public.live_positions;
create policy positions_write on public.live_positions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(group_id));

-- ---------------------------------------------------------------- realtime (chat and positions arrive live)
do $$ begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.live_positions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_routes; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------- group trips: a date, a meeting place, who comes
-- (a route of the group with starts_at and place; each member answers yes / maybe / no)
alter table public.group_routes add column if not exists place text check (char_length(place) <= 200);
drop policy if exists routes_edit on public.group_routes;
create policy routes_edit on public.group_routes for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create table if not exists public.route_rsvp (
  route_id    uuid not null references public.group_routes (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  status      text not null check (status in ('yes', 'maybe', 'no')),
  updated_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);
alter table public.route_rsvp enable row level security;
create or replace function public.route_group(r uuid) returns uuid
  language sql stable security definer set search_path = public as
  $$ select group_id from group_routes where id = r $$;
drop policy if exists rsvp_read on public.route_rsvp;
create policy rsvp_read on public.route_rsvp for select using (public.is_member(public.route_group(route_id)));
drop policy if exists rsvp_write on public.route_rsvp;
create policy rsvp_write on public.route_rsvp for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(public.route_group(route_id)));

-- ---------------------------------------------------------------- who may call the functions
-- (the security advisor: security definer functions are callable through /rest/v1/rpc by anyone). Joining a
-- group and deleting one's account need a signed-in user; the triggers' functions are not for calling at all.
-- is_member, shares_group and route_group stay: the row policies use them for every reader.
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.on_user_created() from public, anon, authenticated;
revoke execute on function public.on_group_created() from public, anon, authenticated;

-- ---------------------------------------------------------------- reported photos
-- A member can report another member's photo (report_photo, from the 🚩 in the group's member list). The
-- photo is hidden for everyone (profiles.photo_hidden, which the app respects) once two people have
-- reported that same photo (photo_reports.photo: its md5), or at once when the owner of a group the person
-- is in reports it. A new photo is shown again (the old reports no longer count); the person cannot
-- unhide a reported photo themselves (on_profile_photo).
alter table public.profiles add column if not exists photo_hidden boolean not null default false;
create table if not exists public.photo_reports (
  reporter    uuid not null references auth.users (id) on delete cascade,
  target      uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (reporter, target)
);
alter table public.photo_reports add column if not exists photo text not null default '';
alter table public.photo_reports enable row level security;     -- no policies: only through report_photo

create or replace function public.report_photo(target uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare hide boolean; h text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if report_photo.target = auth.uid() or not public.shares_group(report_photo.target) then raise exception 'not in your group'; end if;
  select md5(coalesce(avatar, '')) into h from profiles where id = report_photo.target;
  insert into photo_reports (reporter, target, photo) values (auth.uid(), report_photo.target, h)
    on conflict (reporter, target) do update set photo = excluded.photo, created_at = now();
  hide := (select count(*) from photo_reports r where r.target = report_photo.target and r.photo = h) >= 2
    or exists (select 1 from groups g join group_members m on m.group_id = g.id where g.owner = auth.uid() and m.user_id = report_photo.target);
  if hide then
    perform set_config('app.moderation', 'on', true);
    update profiles set photo_hidden = true where id = report_photo.target;
  end if;
  return hide;
end $$;

-- a new photo is shown again; otherwise photo_hidden changes only through report_photo
create or replace function public.on_profile_photo() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.avatar is distinct from old.avatar then
    new.photo_hidden := false;
  elsif coalesce(current_setting('app.moderation', true), '') <> 'on' then
    new.photo_hidden := old.photo_hidden;
  end if;
  return new;
end $$;
create or replace trigger profile_photo before update on public.profiles for each row execute function public.on_profile_photo();
