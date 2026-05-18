import { z } from "zod";

/** Formulaire unique : client + adresse + job (aligné DB Supabase). */
export const newClientJobFormSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.union([z.literal(""), z.string().email("Courriel invalide")]),
  phone: z.string().optional(),
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
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "cancelled"]),
});

export type NewClientJobFormValues = z.infer<typeof newClientJobFormSchema>;

/** Schéma d'édition d'un client existant (adresse non obligatoire). */
export const editClientSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.union([z.literal(""), z.string().email("Courriel invalide")]),
  phone: z.string().optional(),
  address_formatted: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export type EditClientFormValues = z.infer<typeof editClientSchema>;

/** Schéma d'édition d'une job existante. */
export const editJobSchema = z.object({
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "cancelled"]),
  estimated_duration_hours: z.union([z.literal(4), z.literal(8)]),
  preferred_date: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)"),
  ]),
  installation_info: z.string().optional(),
  internal_notes: z.string().optional(),
});

export type EditJobFormValues = z.infer<typeof editJobSchema>;
