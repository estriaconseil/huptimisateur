import type { UserRole } from "@/types/domain";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
};

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    role: data.role as UserRole,
  };
}

/**
 * Retourne l'ID du vendeur (table `salespeople`) lié au compte connecté,
 * UNIQUEMENT si le rôle est `salesperson`.
 * Les admins et secrétaires reçoivent `null` → ils voient tout.
 */
export async function getCurrentSalespersonId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Vérifier d'abord le rôle — seuls les vendeurs sont filtrés
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "salesperson") return null;

  // Résoudre la rangée salespeople liée au compte
  const { data: sp } = await supabase
    .from("salespeople")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (sp as { id: string } | null)?.id ?? null;
}
