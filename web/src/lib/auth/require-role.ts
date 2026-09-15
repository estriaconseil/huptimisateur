import { getCurrentProfile, type CurrentProfile } from "@/lib/supabase/profile";
import type { UserRole } from "@/types/domain";

type Err = { ok: false; message: string };
type OkProfile = { ok: true; profile: CurrentProfile };

/** Utilisateur connecté avec profil (pas de fallback de rôle). */
export async function requireUser(): Promise<OkProfile | Err> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Non authentifié" };
  return { ok: true, profile };
}

/** Admin ou secrétaire — pas les vendeurs. */
export async function requireStaff(): Promise<OkProfile | Err> {
  const check = await requireUser();
  if (!check.ok) return check;
  if (check.profile.role !== "admin" && check.profile.role !== "secretary") {
    return { ok: false, message: "Accès réservé au personnel bureau" };
  }
  return check;
}

/** Administrateur uniquement. */
export async function requireAdmin(): Promise<OkProfile | Err> {
  const check = await requireUser();
  if (!check.ok) return check;
  if (check.profile.role !== "admin") {
    return { ok: false, message: "Accès réservé aux administrateurs" };
  }
  return check;
}

/** Vérifie que le rôle fait partie de la liste autorisée. */
export async function requireRole(
  allowed: UserRole[]
): Promise<OkProfile | Err> {
  const check = await requireUser();
  if (!check.ok) return check;
  if (!allowed.includes(check.profile.role)) {
    return { ok: false, message: "Accès refusé" };
  }
  return check;
}
