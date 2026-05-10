import { z } from "zod";

export const clientSectionSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.string().email("Courriel invalide").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});

export const addressSectionSchema = z.object({
  address_raw: z.string().optional().or(z.literal("")),
  address_formatted: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postal_code: z.string().optional().or(z.literal("")),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export const jobSectionSchema = z.object({
  installation_info: z.string().optional().or(z.literal("")),
  internal_notes: z.string().optional().or(z.literal("")),
  estimated_duration_hours: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  preferred_date: z.string().optional().or(z.literal("")),
  status: z
    .enum(["draft", "scheduled", "in_progress", "completed", "cancelled"])
    .default("draft"),
});

export const newClientJobFormSchema = clientSectionSchema
  .merge(addressSectionSchema)
  .merge(jobSectionSchema);

export type NewClientJobFormValues = z.infer<typeof newClientJobFormSchema>;
