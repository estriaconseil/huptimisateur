-- Un technicien ne peut appartenir qu'à une seule équipe à la fois.
-- Supprime d'abord les doublons éventuels (garde la première affectation par team_id),
-- puis ajoute la contrainte UNIQUE sur technician_id.

delete from public.team_technicians
where ctid not in (
  select min(ctid)
  from public.team_technicians
  group by technician_id
);

alter table public.team_technicians
  add constraint team_technicians_technician_unique unique (technician_id);
