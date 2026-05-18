-- ─────────────────────────────────────────────────────────────────────────────
-- Techniciens + association équipe ↔ techniciens
-- ─────────────────────────────────────────────────────────────────────────────

-- Table techniciens
create table public.technicians (
  id          uuid      primary key default gen_random_uuid(),
  first_name  text      not null,
  last_name   text      not null,
  email       text,
  phone       text,
  active      boolean   not null default true,
  created_at  timestamptz not null default now()
);

create index technicians_active_idx on public.technicians (active);
create index technicians_name_idx   on public.technicians (last_name, first_name);

comment on table public.technicians is 'Techniciens terrain individuels';

-- Table de liaison équipe ↔ technicien (N-N)
create table public.team_technicians (
  team_id        uuid not null references public.teams       (id) on delete cascade,
  technician_id  uuid not null references public.technicians (id) on delete cascade,
  primary key (team_id, technician_id)
);

comment on table public.team_technicians is 'Association équipe ↔ technicien';

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.technicians     enable row level security;
alter table public.team_technicians enable row level security;

-- Lecture : tous les utilisateurs authentifiés
create policy technicians_select_auth
  on public.technicians for select
  to authenticated using (true);

create policy team_technicians_select_auth
  on public.team_technicians for select
  to authenticated using (true);

-- Écriture : admins seulement
create policy technicians_insert_admin
  on public.technicians for insert
  to authenticated with check (public.is_admin());

create policy technicians_update_admin
  on public.technicians for update
  to authenticated using (public.is_admin());

create policy technicians_delete_admin
  on public.technicians for delete
  to authenticated using (public.is_admin());

create policy team_technicians_insert_admin
  on public.team_technicians for insert
  to authenticated with check (public.is_admin());

create policy team_technicians_delete_admin
  on public.team_technicians for delete
  to authenticated using (public.is_admin());
