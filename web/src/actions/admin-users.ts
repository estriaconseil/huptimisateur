"use server";

import { revalidatePath } from "next/cache";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Ok = { ok: true };
type Err = { ok: false; message: string };

/** Vérifie que l'utilisateur courant est admin avant d'exécuter une action sensible */
async function requireAdmin(): Promise<{ ok: true; adminId: string } | Err> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non authentifié" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") return { ok: false, message: "Accès réservé aux administrateurs" };
  return { ok: true, adminId: user.id };
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
};

/** Liste tous les utilisateurs (profils) */
export async function listUsers(): Promise<{ ok: true; users: AdminUserRow[] } | Err> {
  const check = await requireAdmin();
  if (!check.ok) return check;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });

  if (error) return { ok: false, message: error.message };
  return { ok: true, users: (data ?? []) as AdminUserRow[] };
}

/** Invite un nouvel utilisateur par courriel */
export async function inviteUser(input: {
  email: string;
  full_name: string;
  role: "admin" | "secretary" | "salesperson";
}): Promise<Ok | Err> {
  const check = await requireAdmin();
  if (!check.ok) return check;

  const admin = createAdminSupabaseClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.full_name },
  });

  if (error) return { ok: false, message: error.message };
  if (!data?.user?.id) return { ok: false, message: "Utilisateur non créé" };

  // Mettre à jour le profil avec le nom et le rôle
  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    email: input.email,
    full_name: input.full_name,
    role: input.role,
  });

  if (profileError) return { ok: false, message: `Utilisateur créé mais profil non enregistré : ${profileError.message}` };

  revalidatePath("/utilisateurs");
  return { ok: true };
}

/** Réinitialise le mot de passe d'un utilisateur */
export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<Ok | Err> {
  const check = await requireAdmin();
  if (!check.ok) return check;

  if (newPassword.length < 8) {
    return { ok: false, message: "Le mot de passe doit contenir au moins 8 caractères" };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Met à jour le rôle d'un utilisateur */
export async function updateUserRole(
  userId: string,
  role: "admin" | "secretary" | "salesperson"
): Promise<Ok | Err> {
  const check = await requireAdmin();
  if (!check.ok) return check;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/utilisateurs");
  return { ok: true };
}

/** Supprime un compte utilisateur */
export async function deleteUser(userId: string): Promise<Ok | Err> {
  const check = await requireAdmin();
  if (!check.ok) return check;

  // Ne pas supprimer son propre compte
  if (userId === check.adminId) {
    return { ok: false, message: "Vous ne pouvez pas supprimer votre propre compte" };
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/utilisateurs");
  return { ok: true };
}
