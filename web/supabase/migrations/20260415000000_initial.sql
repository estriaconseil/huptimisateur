-- Dispatch MVP — schéma initial
-- Exécuter via Supabase CLI ou SQL Editor

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type public.user_role as enum ('admin', 'secretary');
create type public.job_status as enum (
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);
create type public.schedule_slot as enum ('am', 'pm', 'full_day');
create type public.schedule_row_status as enum ('planned', 'cancelled');

-- Profiles (1:1 auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role public.user_role not null default 'secretary',
  created_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- Teams
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  color text,
  notes text,
  created_at timestamptz not null default now()
);

create index teams_active_idx on public.teams (active);

-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address_raw text,
  address_formatted text,
  city text,
  postal_code text,
  lat double precision,
  lng double precision,
  installation_info text,
  created_at timestamptz not null default now()
);

create index clients_name_idx on public.clients (name);

-- Jobs
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  installation_info text,
  internal_notes text,
  estimated_duration_hours integer not null,
  preferred_date date,
  status public.job_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint jobs_duration_chk check (estimated_duration_hours in (4, 6, 8))
);

create index jobs_client_idx on public.jobs (client_id);
create index jobs_status_idx on public.jobs (status);
create index jobs_preferred_date_idx on public.jobs (preferred_date);

-- Schedules (une ligne = un créneau ou journée entière)
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  scheduled_date date not null,
  slot_type public.schedule_slot not null,
  status public.schedule_row_status not null default 'planned',
  created_at timestamptz not null default now()
);

create index schedules_team_date_idx on public.schedules (team_id, scheduled_date);
create index schedules_job_idx on public.schedules (job_id);

-- Garde-fous : full_day exclusif ; am / pm uniques par équipe et jour
create or replace function public.schedules_team_date_guard()
returns trigger
language plpgsql
as $$
begin
  if new.slot_type = 'full_day' then
    if exists (
      select 1 from public.schedules s
      where s.team_id = new.team_id
        and s.scheduled_date = new.scheduled_date
        and s.id is distinct from new.id
    ) then
      raise exception 'Cette équipe a déjà une affectation ce jour-là';
    end if;
  else
    if exists (
      select 1 from public.schedules s
      where s.team_id = new.team_id
        and s.scheduled_date = new.scheduled_date
        and s.slot_type = 'full_day'
        and s.id is distinct from new.id
    ) then
      raise exception 'La journée est bloquée (intervention longue)';
    end if;
    if new.slot_type = 'am' then
      if exists (
        select 1 from public.schedules s
        where s.team_id = new.team_id
          and s.scheduled_date = new.scheduled_date
          and s.slot_type = 'am'
          and s.id is distinct from new.id
      ) then
        raise exception 'Le créneau AM est déjà pris';
      end if;
    elsif new.slot_type = 'pm' then
      if exists (
        select 1 from public.schedules s
        where s.team_id = new.team_id
          and s.scheduled_date = new.scheduled_date
          and s.slot_type = 'pm'
          and s.id is distinct from new.id
      ) then
        raise exception 'Le créneau PM est déjà pris';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger schedules_team_date_guard_trg
  before insert or update on public.schedules
  for each row
  execute procedure public.schedules_team_date_guard();

-- Paramètres applicatifs (une ligne logique ; contrainte d’unicité)
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  office_address text,
  office_lat double precision,
  office_lng double precision,
  am_start time not null default '08:00',
  am_end time not null default '12:00',
  pm_start time not null default '13:00',
  pm_end time not null default '17:00',
  full_day_threshold_hours integer not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton_chk check (id = '00000000-0000-0000-0000-000000000001'::uuid),
  constraint app_settings_threshold_chk check (full_day_threshold_hours > 0 and full_day_threshold_hours <= 24)
);

-- Trigger profil à l’inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'secretary'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- updated_at app_settings
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_settings_updated_at_trg
  before update on public.app_settings
  for each row
  execute procedure public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.clients enable row level security;
alter table public.jobs enable row level security;
alter table public.schedules enable row level security;
alter table public.app_settings enable row level security;

-- Helper : utilisateur admin ?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Empêcher l’auto-promotion de rôle sans être admin
create or replace function public.profiles_prevent_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Seuls les administrateurs peuvent modifier le rôle';
  end if;
  return new;
end;
$$;

create trigger profiles_role_guard_trg
  before update on public.profiles
  for each row
  execute procedure public.profiles_prevent_role_escalation();

-- Profiles
create policy profiles_select_self_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Teams : lecture pour tous les connectés ; écriture admin
create policy teams_select_auth
  on public.teams for select
  to authenticated
  using (true);

create policy teams_insert_admin
  on public.teams for insert
  to authenticated
  with check (public.is_admin());

create policy teams_update_admin
  on public.teams for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy teams_delete_admin
  on public.teams for delete
  to authenticated
  using (public.is_admin());

-- Clients / jobs / schedules : CRUD pour tout utilisateur connecté (MVP interne)
create policy clients_all_auth
  on public.clients for all
  to authenticated
  using (true)
  with check (true);

create policy jobs_all_auth
  on public.jobs for all
  to authenticated
  using (true)
  with check (true);

create policy schedules_all_auth
  on public.schedules for all
  to authenticated
  using (true)
  with check (true);

-- App settings : lecture tous ; mise à jour admin
create policy app_settings_select_auth
  on public.app_settings for select
  to authenticated
  using (true);

create policy app_settings_update_admin
  on public.app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy app_settings_insert_admin
  on public.app_settings for insert
  to authenticated
  with check (public.is_admin());

-- Seed développement
insert into public.app_settings (
  id,
  office_address,
  office_lat,
  office_lng,
  am_start,
  am_end,
  pm_start,
  pm_end,
  full_day_threshold_hours
) values (
  '00000000-0000-0000-0000-000000000001',
  '1000 Rue Example, Montréal, QC',
  45.5017,
  -73.5673,
  '08:00',
  '12:00',
  '13:00',
  '17:00',
  6
)
on conflict (id) do nothing;

insert into public.teams (name, active, color, notes)
select v.name, v.active, v.color, v.notes
from (
  values
    ('Équipe 1', true, '#2563eb'::text, null::text),
    ('Équipe 2', true, '#16a34a'::text, null::text),
    ('Équipe 3', true, '#ca8a04'::text, null::text),
    ('Équipe 4', true, '#9333ea'::text, null::text),
    ('Équipe 5', true, '#ea580c'::text, null::text),
    ('Équipe 6', true, '#0891b2'::text, null::text)
) as v(name, active, color, notes)
where not exists (select 1 from public.teams);

comment on table public.profiles is 'Profils utilisateurs liés à auth.users';
comment on table public.teams is 'Équipes terrain (pas des individus)';
comment on table public.schedules is 'Affectations : am, pm, ou full_day pour jobs longues';
