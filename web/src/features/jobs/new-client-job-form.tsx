"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, startOfWeek } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { AddressAutocomplete } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  type NewClientJobFormValues,
  newClientJobFormSchema,
} from "@/lib/validations/client-job";

import { selectClass } from "@/lib/ui/form-styles";
import { createClientAndJob } from "./actions/create-client-job";

type Props = {
  /** Appelé après création réussie (mode modal). Quand absent, utilise la navigation normale. */
  onSuccess?: (jobId: string) => void;
};

export function NewClientJobForm({ onSuccess }: Props = {}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<NewClientJobFormValues>({
    resolver: zodResolver(newClientJobFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address_raw: "",
      address_formatted: "",
      city: "",
      postal_code: "",
      lat: null,
      lng: null,
      installation_info: "",
      internal_notes: "",
      estimated_duration_hours: 4,
      preferred_date: "",
      status: "soumission_en_attente",
    },
  });

  const { watch, setValue, register, handleSubmit, formState } = form;

  const addressDisplay = watch("address_formatted") || watch("address_raw") || "";

  const onPlaceResolved = useCallback(
    (p: {
      address_raw: string;
      address_formatted: string;
      city: string;
      postal_code: string;
      lat: number | null;
      lng: number | null;
    }) => {
      setValue("address_raw", p.address_raw, { shouldValidate: true, shouldDirty: true });
      setValue("address_formatted", p.address_formatted, { shouldValidate: true });
      setValue("city", p.city, { shouldValidate: true });
      setValue("postal_code", p.postal_code, { shouldValidate: true });
      setValue("lat", p.lat, { shouldValidate: true });
      setValue("lng", p.lng, { shouldValidate: true });
    },
    [setValue]
  );

  const onAddressChange = useCallback(
    (v: string) => {
      setValue("address_raw", v, { shouldDirty: true });
      setValue("address_formatted", v, { shouldDirty: true });
    },
    [setValue]
  );

  async function submitForm(data: NewClientJobFormValues, thenSuggest: boolean) {
    setSubmitError(null);
    if (!data.address_formatted?.trim()) {
      form.setError("address_formatted", { message: "Adresse requise — sélectionnez une adresse dans la liste Google" });
      return;
    }
    if (data.lat == null || data.lng == null) {
      form.setError("address_formatted", { message: "Sélectionnez l'adresse dans la liste Google pour obtenir les coordonnées GPS (nécessaires pour les suggestions de distance)" });
      return;
    }
    const result = await createClientAndJob(data);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    form.reset();
    if (onSuccess) {
      onSuccess(result.jobId);
      return;
    }
    if (thenSuggest) {
      const week = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      router.push(`/dispatch?week=${week}&jobId=${result.jobId}&suggest=1`);
    } else {
      router.push(`/nouveau?created=${result.jobId}`);
    }
    router.refresh();
  }

  return (
    <form className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
          <CardDescription>Coordonnées du client ou du site.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" {...register("name")} />
            {formState.errors.name && (
              <p className="text-destructive text-sm">{formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Courriel</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {formState.errors.email && (
              <p className="text-destructive text-sm">{formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="address_search">
              Adresse <span className="text-destructive">*</span>
            </Label>
            <AddressAutocomplete
              id="address_search"
              value={addressDisplay}
              onChange={onAddressChange}
              onResolved={onPlaceResolved}
              disabled={formState.isSubmitting}
            />
            {/* Indicateur GPS */}
            {watch("lat") != null
              ? <p className="text-[11px] text-emerald-600">✓ Adresse géocodée — coordonnées GPS enregistrées</p>
              : <p className="text-[11px] text-muted-foreground">Sélectionnez une adresse dans la liste pour activer les suggestions de distance.</p>
            }
            {formState.errors.address_formatted && (
              <p className="text-destructive text-sm">{formState.errors.address_formatted.message}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Code postal</Label>
              <Input id="postal_code" {...register("postal_code")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job</CardTitle>
          <CardDescription>Installation, durée et statut.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="installation_info">Information sur l&apos;installation</Label>
            <Textarea id="installation_info" rows={3} {...register("installation_info")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="internal_notes">Notes internes</Label>
            <Textarea id="internal_notes" rows={3} {...register("internal_notes")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="estimated_duration_hours">Durée estimée</Label>
              <select
                id="estimated_duration_hours"
                className={selectClass}
                {...register("estimated_duration_hours", { valueAsNumber: true })}
              >
                <option value={4}>4 h — Demi-journée (AM ou PM)</option>
                <option value={8}>8 h — Journée complète</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferred_date">Date souhaitée (optionnel)</Label>
              <Input id="preferred_date" type="date" {...register("preferred_date")} />
              {formState.errors.preferred_date && (
                <p className="text-destructive text-sm">{formState.errors.preferred_date.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Statut initial</Label>
            <select id="status" className={selectClass} {...register("status")}>
              <option value="soumission_en_attente">Prospect</option>
              <option value="soumission_repartie">Visite planifiée</option>
              <option value="en_attente">En attente</option>
              <option value="a_planifier">À planifier</option>
              <option value="reparti">Réparti</option>
              <option value="retour_a_faire">Retour à faire</option>
              <option value="facturation">Facturation</option>
              <option value="complete">Complété</option>
              <option value="termine">Terminé</option>
              <option value="annule">Annulé</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {submitError && (
        <p className="text-destructive text-sm" role="alert">
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="h-[38px] px-5"
          disabled={formState.isSubmitting}
          onClick={() => void handleSubmit((d) => submitForm(d, false))()}
        >
          {formState.isSubmitting ? "Enregistrement…" : "Créer"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-[38px] px-5"
          disabled={formState.isSubmitting}
          onClick={() => void handleSubmit((d) => submitForm(d, true))()}
        >
          Créer et planifier
        </Button>
      </div>
    </form>
  );
}
