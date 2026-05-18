/** Utilitaires partagés pour afficher le statut d'une job dans l'UI. */

export function statusLabel(s: string): string {
  switch (s) {
    case "draft":        return "À placer";
    case "scheduled":    return "Planifiée";
    case "in_progress":  return "En cours";
    case "completed":    return "Terminée";
    case "cancelled":    return "Annulée";
    default:             return s;
  }
}

export function statusVariant(
  s: string
): "secondary" | "default" | "outline" | "destructive" {
  if (s === "scheduled" || s === "in_progress") return "default";
  if (s === "cancelled")                         return "destructive";
  if (s === "completed")                         return "outline";
  return "secondary";
}
