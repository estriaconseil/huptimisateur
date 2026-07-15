/** Utilitaires partagés pour afficher le statut d'une job dans l'UI. */

export function statusLabel(s: string): string {
  switch (s) {
    case "soumission_en_attente": return "Prospect";
    case "soumission_repartie":   return "Visite planifiée";
    case "en_attente":            return "En attente";
    case "a_planifier":           return "À planifier";
    case "reparti":               return "Réparti";
    case "retour_a_faire":        return "Retour à faire";
    case "facturation":           return "Facturation";
    case "complete":              return "Complété";
    case "termine":               return "Terminé";
    case "annule":                return "Annulé";
    // Legacy — conservés pour la compatibilité BD transitoire
    case "prospect":              return "Prospect";
    case "a_suivre":              return "À suivre";
    case "a_relancer":            return "À relancer";
    default:                      return s;
  }
}

export function statusVariant(
  s: string
): "secondary" | "default" | "outline" | "destructive" {
  switch (s) {
    case "reparti":
    case "facturation":
      return "default";
    case "annule":
      return "destructive";
    case "complete":
    case "termine":
      return "outline";
    default:
      return "secondary";
  }
}

/** Couleur de fond CSS pour les badges de statut (calendrier, cartes). */
export function statusColor(s: string): string {
  switch (s) {
    case "soumission_en_attente": return "bg-amber-100 text-amber-800";
    case "soumission_repartie":   return "bg-blue-100 text-blue-800";
    case "en_attente":            return "bg-violet-100 text-violet-800";
    case "a_planifier":           return "bg-emerald-100 text-emerald-800";
    case "reparti":               return "bg-green-200 text-green-900";
    case "retour_a_faire":        return "bg-orange-100 text-orange-800";
    case "facturation":           return "bg-orange-100 text-orange-800";
    case "complete":              return "bg-gray-100 text-gray-600";
    case "termine":               return "bg-gray-100 text-gray-600";
    case "annule":                return "bg-red-100 text-red-700";
    // Legacy
    case "prospect":              return "bg-slate-100 text-slate-700";
    case "a_suivre":              return "bg-blue-100 text-blue-800";
    case "a_relancer":            return "bg-purple-100 text-purple-800";
    default:                      return "bg-gray-100 text-gray-700";
  }
}

/** Couleur du badge drapeau follow_up_flag */
export function flagColor(flag: string | null): string {
  switch (flag) {
    case "a_suivre":   return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "a_relancer": return "bg-red-100 text-red-700 border-red-300";
    case "rdv_passe":  return "bg-orange-100 text-orange-800 border-orange-300";
    default:           return "";
  }
}

export function flagLabel(flag: string | null): string {
  switch (flag) {
    case "a_suivre":   return "À suivre";
    case "a_relancer": return "À relancer";
    case "rdv_passe":  return "RDV passé";
    default:           return "";
  }
}
