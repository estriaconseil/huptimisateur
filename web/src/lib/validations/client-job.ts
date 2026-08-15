import { z } from "zod";

const JOB_STATUS_ENUM = [
  "soumission_en_attente",
  "soumission_repartie",
  "en_attente",
  "a_planifier",
  "reparti",
  "retour_a_faire",

  "complete",
  "termine",
  "annule",
] as const;

/** Formulaire unique : client + adresse de facturation + adresse d'installation + job. */
export const newClientJobFormSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.union([z.literal(""), z.string().email("Courriel invalide")]),
  phone: z.string().optional(),

  /** Adresse de facturation du client */
  billing_address: z.string().optional(),
  billing_city: z.string().optional(),
  billing_postal: z.string().optional(),

  /** Adresse d'installation du chantier */
  install_address_formatted: z.string().optional(),
  install_city: z.string().optional(),
  install_postal_code: z.string().optional(),
  install_lat: z.number().nullable().optional(),
  install_lng: z.number().nullable().optional(),

  /** @deprecated Anciens champs conservés pour rétrocompatibilité — Phase 3 mettra à jour les UI */
  address_raw: z.string().optional(),
  address_formatted: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),

  installation_info: z.string().optional(),
  internal_notes: z.string().optional(),
  estimated_duration_hours: z.union([z.literal(4), z.literal(8)]),
  preferred_date: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)"),
  ]),
  status: z.enum(JOB_STATUS_ENUM),
});

export type NewClientJobFormValues = z.infer<typeof newClientJobFormSchema>;

/** Schéma d'édition d'un client existant. */
export const editClientSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.union([z.literal(""), z.string().email("Courriel invalide")]),
  phone: z.string().optional(),
  billing_address: z.string().optional(),
  billing_city: z.string().optional(),
  billing_postal: z.string().optional(),
  /** @deprecated Anciens champs conservés pour rétrocompatibilité — Phase 3 mettra à jour les UI */
  address_formatted: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export type EditClientFormValues = z.infer<typeof editClientSchema>;

/** Schéma d'édition d'une job existante. */
export const editJobSchema = z.object({
  status: z.enum(JOB_STATUS_ENUM),
  estimated_duration_hours: z.union([z.literal(4), z.literal(8)]),
  preferred_date: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)"),
  ]),
  follow_up_date: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)"),
  ]).optional(),
  follow_up_flag: z.enum(["a_suivre", "a_relancer", "rdv_passe"]).nullable().optional(),
  salesperson_id: z.string().optional(),
  /** Ownership volontaire : suggestions filtrées sur ce vendeur. */
  salesperson_locked: z.boolean().optional(),
  installation_info: z.string().optional(),
  internal_notes: z.string().optional(),
  cancellation_reason: z.string().optional(),
  cancellation_notes: z.string().optional(),
});

export type EditJobFormValues = z.infer<typeof editJobSchema>;
