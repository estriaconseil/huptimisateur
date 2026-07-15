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

/**
 * Crée un utilisateur directement (option B) :
 * email + mot de passe + email confirmé — prêt à se connecter tout de suite.
 */
export async function createUser(input: {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "secretary" | "salesperson";
}): Promise<Ok | Err> {
  const check = await requireAdmin();
  if (!check.ok) return check;

  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  if (!email || !fullName) {
    return { ok: false, message: "Nom et courriel requis" };
  }
  if (input.password.length < 8) {
    return { ok: false, message: "Le mot de passe doit contenir au moins 8 caractères" };
  }

  const admin = createAdminSupabaseClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) return { ok: false, message: error.message };
  if (!data?.user?.id) return { ok: false, message: "Utilisateur non créé" };

  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    role: input.role,
  });

  if (profileError) {
    return {
      ok: false,
      message: `Utilisateur créé mais profil non enregistré : ${profileError.message}`,
    };
  }

  revalidatePath("/utilisateurs");
  return { ok: true };
}

/** Réinitialise le mot de passe (et confirme l'email si le compte était en attente). */
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
    email_confirm: true,
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
