/**
 * Machine d'états centralisée pour le cycle de vie d'un Job.
 *
 * Règles de transition :
 *  - VENTES  : soumission_en_attente ↔ soumission_repartie ↔ en_attente → a_planifier | annule
 *  - INSTALL : a_planifier → reparti ↔ retour_a_faire → termine | annule
 *
 * Certaines transitions nécessitent des conditions supplémentaires
 * (ex : soumission_repartie exige un appointment_id) — celles-ci sont
 * validées côté serveur dans les actions correspondantes.
 */

import type { JobStatus } from "@/types/domain";

/** Transitions valides par statut source. */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  soumission_en_attente: ["soumission_repartie", "en_attente", "a_planifier", "annule"],
  soumission_repartie:   ["soumission_en_attente", "en_attente", "a_planifier", "annule"],
  en_attente:            ["soumission_en_attente", "soumission_repartie", "a_planifier", "annule"],
  // Transitions installation — gérées via assignJobToSlot / removeSchedule
  a_planifier:           ["reparti", "annule"],
  reparti:               ["retour_a_faire", "termine", "a_planifier", "annule"],
  retour_a_faire:        ["reparti", "termine", "annule"],
  // États terminaux
  complete:              ["termine"],   // héritage — ne plus utiliser
  termine:               [],
  annule:                [],
};

/** Retourne true si la transition from → to est autorisée. */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return (JOB_TRANSITIONS[from] ?? []).includes(to);
}

/** Retourne la liste des statuts vers lesquels on peut transitionner depuis `from`. */
export function allowedTransitions(from: JobStatus): JobStatus[] {
  return JOB_TRANSITIONS[from] ?? [];
}

/**
 * Libellés humains pour chaque statut — source de vérité UI.
 * (Dupliqué depuis job-status.ts pour que la machine d'états soit autonome ;
 *  les composants peuvent continuer d'utiliser statusLabel() de job-status.ts.)
 */
export const STATUS_LABELS: Record<JobStatus, string> = {
  soumission_en_attente: "Prospect",
  soumission_repartie:   "Visite planifiée",
  en_attente:            "Va nous rappeler",
  a_planifier:           "À planifier",
  reparti:               "Réparti",
  retour_a_faire:        "Retour à faire",
  complete:              "Complété",
  termine:               "Terminé",
  annule:                "Annulé",
};

/** Couleur Tailwind du badge par statut. */
export const STATUS_COLORS: Record<JobStatus, string> = {
  soumission_en_attente: "bg-amber-100 text-amber-800",
  soumission_repartie:   "bg-blue-100 text-blue-800",
  en_attente:            "bg-violet-100 text-violet-800",
  a_planifier:           "bg-emerald-100 text-emerald-800",
  reparti:               "bg-blue-100 text-blue-800",
  retour_a_faire:        "bg-orange-100 text-orange-800",
  complete:              "bg-gray-100 text-gray-600",
  termine:               "bg-gray-100 text-gray-600",
  annule:                "bg-red-100 text-red-700",
};
