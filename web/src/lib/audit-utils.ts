/**
 * Utilitaires purs pour l'affichage de l'historique d'audit.
 * Pas de directive "use server" — utilisable côté client et serveur.
 */

import type { AuditEntry } from "@/actions/audit";

// ─────────────────────────────────────────────────────────────────────────────
// Labels lisibles pour les champs de la DB
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  scheduled_date:            "Date",
  start_time:                "Heure",
  status:                    "Statut",
  salesperson_id:            "Vendeur",
  client_id:                 "Client",
  installation_address_id:   "Adresse d'installation",
  client_lat:                "GPS latitude",
  client_lng:                "GPS longitude",
  notes:                     "Notes",
  name:                      "Nom",
  phone:                     "Téléphone",
  cell:                      "Cellulaire",
  email:                     "Courriel",
  address_formatted:         "Adresse",
  city:                      "Ville",
  postal_code:               "Code postal",
  billing_address:           "Adresse de facturation",
  billing_city:              "Ville de facturation",
  billing_postal:            "Code postal de facturation",
  internal_notes:            "Notes internes",
  sales_note:                "Note de vente",
  installation_info:         "Notes d'installation",
  estimated_duration_hours:  "Durée estimée (h)",
  preferred_date:            "Date préférée",
  follow_up_date:            "Date de suivi",
  follow_up_flag:            "Marqueur de suivi",
  cancellation_reason:       "Raison d'annulation",
  cancellation_notes:        "Notes d'annulation",
  team_id:                   "Équipe",
  slot_type:                 "Plage",
  job_id:                    "Job",
  quote_id:                  "Soumission",
  appointment_id:            "RDV vente",
  salesperson_locked:        "Vendeur verrouillé",
};

/** Champs FK → clé dans AuditLookups */
const FK_LOOKUP: Record<string, keyof AuditLookups> = {
  salesperson_id: "salespeople",
  team_id:        "teams",
  appointment_id: "appointments",
  client_id:      "clients",
  quote_id:       "quotes",
};

const STATUS_VALUE_LABELS: Record<string, string> = {
  soumission_en_attente: "Prospect",
  soumission_repartie:   "Visite planifiée",
  en_attente:            "Va nous rappeler",
  a_planifier:           "À planifier",
  reparti:               "Réparti",
  retour_a_faire:        "Retour à faire",
  planifie:              "Planifié",
  en_cours:              "En cours",
  termine:               "Terminé",
  complete:              "Complété",
  annule:                "Annulé",
  scheduled:             "Prévu",
  completed:             "Complété",
  no_show:               "Absent",
  cancelled:             "Annulé",
};

const FLAG_VALUE_LABELS: Record<string, string> = {
  a_suivre:   "À suivre",
  a_relancer: "À relancer",
  rdv_passe:  "RDV passé",
};

/** Champs techniques à ne pas afficher dans le diff */
const SKIP_FIELDS = new Set([
  "id", "created_at", "updated_at", "created_by",
]);

export type AuditLookups = {
  salespeople: Record<string, string>;
  teams: Record<string, string>;
  appointments: Record<string, string>;
  clients: Record<string, string>;
  quotes: Record<string, string>;
};

export const EMPTY_AUDIT_LOOKUPS: AuditLookups = {
  salespeople: {},
  teams: {},
  appointments: {},
  clients: {},
  quotes: {},
};

export type FieldChange = {
  field: string;
  label: string;
  from: string;
  to: string;
};

/** Formate une valeur brute (UUID, statut, bool…) en libellé lisible. */
export function formatAuditValue(
  field: string,
  value: unknown,
  lookups: AuditLookups = EMPTY_AUDIT_LOOKUPS,
): string {
  if (value == null || value === "") return "—";

  if (typeof value === "boolean") return value ? "Oui" : "Non";

  const str = String(value);

  const lookupKey = FK_LOOKUP[field];
  if (lookupKey) {
    return lookups[lookupKey][str] ?? str;
  }

  if (field === "status") {
    return STATUS_VALUE_LABELS[str] ?? str;
  }
  if (field === "follow_up_flag") {
    return FLAG_VALUE_LABELS[str] ?? str;
  }

  return str;
}

/** Calcule la liste des champs modifiés entre old_data et new_data (UPDATE). */
export function diffFields(
  old_data: Record<string, unknown> | null,
  new_data: Record<string, unknown> | null,
  lookups: AuditLookups = EMPTY_AUDIT_LOOKUPS,
): FieldChange[] {
  if (!old_data || !new_data) return [];
  const changes: FieldChange[] = [];

  for (const key of Object.keys(new_data)) {
    if (SKIP_FIELDS.has(key)) continue;
    const oldVal = old_data[key];
    const newVal = new_data[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        label: FIELD_LABELS[key] ?? key,
        from: formatAuditValue(key, oldVal, lookups),
        to:   formatAuditValue(key, newVal, lookups),
      });
    }
  }

  return changes;
}

/** Résumé humain d'une entrée d'audit. */
export function auditSummary(entry: AuditEntry): string {
  switch (entry.operation) {
    case "INSERT": return "Créé";
    case "DELETE": return "Supprimé";
    case "UPDATE": {
      const changes = diffFields(entry.old_data, entry.new_data);
      if (changes.length === 0) return "Modifié";
      const fields = changes.map((c) => c.label).join(", ");
      return `Modifié — ${fields}`;
    }
  }
}
