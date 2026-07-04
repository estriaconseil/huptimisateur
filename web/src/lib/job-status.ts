/** Utilitaires partagés pour afficher le statut d'une job dans l'UI. */

export function statusLabel(s: string): string {
  switch (s) {
    case "prospect":              return "Prospect";
    case "soumission_en_attente": return "Soumission en attente";
    case "a_suivre":              return "À suivre";
    case "a_relancer":            return "À relancer";
    case "a_planifier":           return "À planifier";
    case "reparti":               return "Réparti";
    case "facturation":           return "Facturation";
    case "complete":              return "Complété";
    case "annule":                return "Annulé";
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
      return "outline";
    default:
      return "secondary";
  }
}

/** Couleur de fond CSS pour les badges de statut (calendrier, cartes). */
export function statusColor(s: string): string {
  switch (s) {
    case "prospect":              return "bg-slate-100 text-slate-700";
    case "soumission_en_attente": return "bg-amber-100 text-amber-800";
    case "a_suivre":              return "bg-blue-100 text-blue-800";
    case "a_relancer":            return "bg-purple-100 text-purple-800";
    case "a_planifier":           return "bg-emerald-100 text-emerald-800";
    case "reparti":               return "bg-green-200 text-green-900";
    case "facturation":           return "bg-orange-100 text-orange-800";
    case "complete":              return "bg-gray-100 text-gray-600";
    case "annule":                return "bg-red-100 text-red-700";
    default:                      return "bg-gray-100 text-gray-700";
  }
}
