/** Libellés lisibles pour chaque type d'entrée du journal d'activité. */
export function activityLabel(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "status_changed":
      return `Statut : ${details.from ?? "?"} → ${details.to ?? "?"}`;
    case "appointment_booked":
      return `RDV planifié — ${details.date ?? ""} à ${details.time ?? ""}`;
    case "appointment_moved":
      return `RDV déplacé — ${details.date ?? ""} à ${details.time ?? ""}`;
    case "appointment_cancelled":
      return "RDV annulé";
    case "appointment_completed":
      return "RDV complété";
    case "schedule_assigned":
      return `Installation planifiée — ${details.date ?? ""} (${details.slot ?? ""}) · ${details.team ?? ""}`;
    case "schedule_removed":
      return "Installation retirée du calendrier";
    case "note_added":
      return "Note ajoutée";
    case "converted_to_install":
      return "Soumission acceptée — transférée en installation";
    case "client_updated":
      return "Informations client modifiées";
    default:
      return action;
  }
}
