create type public.app_role as enum ('student','cr','society_rep','teacher','admin');
create type public.room_type as enum ('classroom','lt','activity_space');
create type public.room_status as enum ('ONGOING','NOT_ARRIVED','CANCELLED','CHANGED','FREE','OCCUPIED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "profiles readable by signed-in" on public.profiles for select to authenticated using (true);
create policy "own profile name update" on public.profiles for update to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin')) with check (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'teacher'));
create policy "admin grants roles" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin revokes roles" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 1 and 40),
  building text not null check (char_length(building) between 1 and 60),
  floor int not null default 0,
  capacity int check (capacity is null or capacity between 0 and 2000),
  room_type room_type not null,
  active boolean not null default true,
  current_status room_status not null default 'FREE',
  status_note text,
  status_updated_at timestamptz not null default now(),
  status_updated_by_name text,
  created_at timestamptz not null default now()
);
grant select on public.rooms to anon;
grant select, insert, update on public.rooms to authenticated;
grant all on public.rooms to service_role;
alter table public.rooms enable row level security;
create policy "rooms public read" on public.rooms for select to anon, authenticated using (true);
create policy "admin inserts rooms" on public.rooms for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin edits rooms" on public.rooms for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.protect_room_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.status_write', true) is distinct from 'on' then
    new.current_status := old.current_status;
    new.status_note := old.status_note;
    new.status_updated_at := old.status_updated_at;
    new.status_updated_by_name := old.status_updated_by_name;
  end if;
  return new;
end $$;
create trigger rooms_protect_status before update on public.rooms for each row execute function public.protect_room_status();

create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index room_assignments_one_active on public.room_assignments(user_id, room_id) where active;
grant select, update on public.room_assignments to authenticated;
grant all on public.room_assignments to service_role;
alter table public.room_assignments enable row level security;

create or replace function public.room_type_of(_room uuid)
returns room_type language sql stable security definer set search_path = public as $$
  select room_type from public.rooms where id = _room
$$;

create policy "assignments read" on public.room_assignments for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'teacher'));
create policy "assignments deactivate" on public.room_assignments for update to authenticated
  using (public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'teacher') and public.room_type_of(room_id) <> 'activity_space'))
  with check (public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'teacher') and public.room_type_of(room_id) <> 'activity_space'));

create table public.status_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status room_status not null,
  note text check (note is null or char_length(note) <= 280),
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index status_logs_room_created on public.status_logs(room_id, created_at desc);
grant select on public.status_logs to authenticated;
grant all on public.status_logs to service_role;
alter table public.status_logs enable row level security;
create policy "history read" on public.status_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'teacher') or user_id = auth.uid());

create or replace function public.can_update_room(_user uuid, _room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms r
    join public.profiles p on p.id = _user and p.active
    where r.id = _room and r.active and (
      public.has_role(_user,'admin')
      or (public.has_role(_user,'teacher') and r.room_type <> 'activity_space')
      or (r.room_type <> 'activity_space' and public.has_role(_user,'cr') and exists (
            select 1 from public.room_assignments a where a.user_id=_user and a.room_id=r.id and a.active))
      or (r.room_type = 'activity_space' and public.has_role(_user,'society_rep') and exists (
            select 1 from public.room_assignments a where a.user_id=_user and a.room_id=r.id and a.active))
    )
  )
$$;

create or replace function public.set_room_status(_room uuid, _status room_status, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _type room_type; _name text; _clean text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if not public.can_update_room(auth.uid(), _room) then
    raise exception 'You are not allowed to update this room';
  end if;
  select room_type into _type from public.rooms where id = _room;
  if _type = 'activity_space' and _status not in ('FREE','OCCUPIED') then
    raise exception 'Activity spaces can only be FREE or OCCUPIED';
  end if;
  if _type <> 'activity_space' and _status = 'OCCUPIED' then
    raise exception 'OCCUPIED applies only to activity spaces';
  end if;
  _clean := nullif(btrim(_note), '');
  if _clean is not null and char_length(_clean) > 280 then raise exception 'Note is too long (max 280 characters)'; end if;
  select coalesce(nullif(name,''), email) into _name from public.profiles where id = auth.uid();
  insert into public.status_logs(room_id, status, note, user_id) values (_room, _status, _clean, auth.uid());
  perform set_config('app.status_write','on', true);
  update public.rooms set current_status=_status, status_note=_clean, status_updated_at=now(), status_updated_by_name=_name where id=_room;
  perform set_config('app.status_write','off', true);
end $$;

create or replace function public.assign_room(_email text, _room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid; _type room_type; _active boolean;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select room_type, active into _type, _active from public.rooms where id = _room;
  if _type is null then raise exception 'Room not found'; end if;
  if not _active then raise exception 'Room is deactivated'; end if;
  if not (public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'teacher') and _type <> 'activity_space')) then
    raise exception 'You are not allowed to assign this room';
  end if;
  select id into _uid from public.profiles where lower(email) = lower(btrim(_email)) and active;
  if _uid is null then raise exception 'No active user with that email. They must sign in once first.'; end if;
  if exists (select 1 from public.room_assignments where user_id=_uid and room_id=_room and active) then
    raise exception 'This user is already assigned to this room';
  end if;
  insert into public.room_assignments(user_id, room_id, granted_by) values (_uid, _room, auth.uid());
  insert into public.user_roles(user_id, role)
    values (_uid, case when _type = 'activity_space' then 'society_rep'::app_role else 'cr'::app_role end)
    on conflict do nothing;
end $$;

grant execute on function public.set_room_status(uuid, room_status, text) to authenticated;
grant execute on function public.assign_room(text, uuid) to authenticated;
grant execute on function public.can_update_room(uuid, uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  insert into public.user_roles(user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter publication supabase_realtime add table public.rooms;

insert into public.rooms(code, building, floor, capacity, room_type) values
 ('CSED-101','CSED',1,60,'classroom'),('CSED-102','CSED',1,60,'classroom'),('CSED-103','CSED',1,60,'classroom'),
 ('CSED-201','CSED',2,60,'classroom'),('CSED-202','CSED',2,60,'classroom'),('CSED-204','CSED',2,60,'classroom'),
 ('LT-301','LT Block',3,180,'lt'),('LT-302','LT Block',3,180,'lt'),
 ('Activity Space 1','Activity Block',1,40,'activity_space'),('Activity Space 2','Activity Block',1,40,'activity_space');