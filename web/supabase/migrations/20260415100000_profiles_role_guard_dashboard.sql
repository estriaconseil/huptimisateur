-- Permet de changer un rôle depuis le SQL Editor (auth.uid() NULL) ou par un admin JWT.
-- Ne bloque que si un utilisateur connecté non-admin tente de modifier le rôle.

create or replace function public.profiles_prevent_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Seuls les administrateurs peuvent modifier le rôle';
  end if;
  return new;
end;
$$;
