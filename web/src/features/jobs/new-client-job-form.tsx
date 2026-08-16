"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, startOfWeek } from "date-fns";
import { ExternalLink, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { AddressAutocomplete } from "@/components/maps/address-autocomplete";
import type { ResolvedPlace } from "@/components/maps/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  type NewClientJobFormValues,
  newClientJobFormSchema,
} from "@/lib/validations/client-job";
import { statusColor, statusLabel } from "@/lib/job-status";
import { cn } from "@/lib/utils";

import { checkInstallationAddressExists, type AddressMatch } from "@/actions/prospects";
import { selectClass } from "@/lib/ui/form-styles";
import { createClientAndJob } from "./actions/create-client-job";

type Props = {
  /** Appelé après création réussie (mode modal). Quand absent, utilise la navigation normale. */
  onSuccess?: (jobId: string) => void;
};

export function NewClientJobForm({ onSuccess }: Props = {}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sameAddress, setSameAddress] = useState(false);
  const [addressMatches, setAddressMatches] = useState<AddressMatch[] | null>(null);
  const [pendingSubmitData, setPendingSubmitData] = useState<{ data: NewClientJobFormValues; thenSuggest: boolean } | null>(null);

  const form = useForm<NewClientJobFormValues>({
    resolver: zodResolver(newClientJobFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      billing_address: "",
      billing_city: "",
      billing_postal: "",
      install_address_formatted: "",
      install_city: "",
      install_postal_code: "",
      install_lat: null,
      install_lng: null,
      installation_info: "",
      internal_notes: "",
      estimated_duration_hours: 4,
      preferred_date: "",
      status: "soumission_en_attente",
    },
  });

  const { watch, setValue, register, handleSubmit, formState } = form;

  const [billingDisplay, setBillingDisplay] = useState("");

  // ── Installation (seule source GPS) ──
  const installDisplay = watch("install_address_formatted") || "";

  const onInstallResolved = useCallback((p: ResolvedPlace) => {
    const addr = p.address_formatted || p.address_raw;
    setValue("install_address_formatted", addr, { shouldValidate: true, shouldDirty: true });
    setValue("install_city", p.city, { shouldValidate: true });
    setValue("install_postal_code", p.postal_code, { shouldValidate: true });
    setValue("install_lat", p.lat, { shouldValidate: true });
    setValue("install_lng", p.lng, { shouldValidate: true });
    if (sameAddress) {
      setBillingDisplay(addr);
      setValue("billing_address", addr);
      setValue("billing_city", p.city);
      setValue("billing_postal", p.postal_code);
    }
  }, [setValue, sameAddress]);

  const onBillingResolved = useCallback((p: ResolvedPlace) => {
    const addr = p.address_formatted || p.address_raw;
    setBillingDisplay(addr);
    setValue("billing_address", addr);
    setValue("billing_city", p.city);
    setValue("billing_postal", p.postal_code);
  }, [setValue]);

  const handleSameAddress = (checked: boolean) => {
    setSameAddress(checked);
    if (checked) {
      const addr = watch("install_address_formatted") || "";
      setBillingDisplay(addr);
      setValue("billing_address", addr);
      setValue("billing_city", watch("install_city") || "");
      setValue("billing_postal", watch("install_postal_code") || "");
    }
  };

  async function doCreate(data: NewClientJobFormValues, thenSuggest: boolean) {
    const result = await createClientAndJob(data);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    form.reset();
    setBillingDisplay("");
    setSameAddress(false);
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

  async function submitForm(data: NewClientJobFormValues, thenSuggest: boolean) {
    setSubmitError(null);
    if (!data.install_address_formatted?.trim()) {
      form.setError("install_address_formatted", { message: "Adresse d'installation requise — sélectionnez une adresse dans la liste Google" });
      return;
    }
    if (data.install_lat == null || data.install_lng == null) {
      form.setError("install_address_formatted", { message: "Sélectionnez l'adresse dans la liste Google pour obtenir les coordonnées GPS" });
      return;
    }
    // Si même adresse, s'assurer que billing = install
    if (sameAddress) {
      data.billing_address = data.install_address_formatted;
      data.billing_city = data.install_city;
      data.billing_postal = data.install_postal_code;
    }

    // Vérifier si l'adresse d'installation existe déjà chez un autre client
    const checkRes = await checkInstallationAddressExists(data.install_address_formatted);
    if (checkRes.ok && checkRes.matches.length > 0) {
      setAddressMatches(checkRes.matches);
      setPendingSubmitData({ data, thenSuggest });
      return;
    }

    await doCreate(data, thenSuggest);
  }

  return (
    <>
    {/* Dialog confirmation adresse connue */}
    <Dialog
      open={addressMatches !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAddressMatches(null);
          setPendingSubmitData(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-amber-600" />
            Adresse déjà connue
          </DialogTitle>
          <DialogDescription>
            Cette adresse d&apos;installation existe déjà dans la base de données. Veux-tu tout de même créer un nouveau dossier ?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto py-1">
          {(addressMatches ?? []).map((match) => (
            <div
              key={match.installation_address_id}
              className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-sm text-foreground">{match.client_name}</p>
                {match.client_phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {match.client_phone}
                  </span>
                )}
                <Link
                  href={`/clients/adresse/${match.installation_address_id}`}
                  target="_blank"
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline"
                >
                  <ExternalLink className="size-3" />
                  Voir la fiche
                </Link>
              </div>
              {match.jobs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {match.jobs.slice(0, 3).map((job) => (
                    <span
                      key={job.id}
                      className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColor(job.status))}
                    >
                      {statusLabel(job.status)}{job.quote_number ? ` — #${job.quote_number}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              setAddressMatches(null);
              setPendingSubmitData(null);
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={async () => {
              if (!pendingSubmitData) return;
              const { data, thenSuggest } = pendingSubmitData;
              setAddressMatches(null);
              setPendingSubmitData(null);
              await doCreate(data, thenSuggest);
            }}
          >
            Créer quand même
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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

      {/* ── Adresse d'installation (GPS) ── */}
      <Card>
        <CardHeader>
          <CardTitle>Adresse d&apos;installation</CardTitle>
          <CardDescription>Emplacement de l&apos;installation — seule source GPS pour la planification.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="install_address_search">
              Adresse d&apos;installation <span className="text-destructive">*</span>
            </Label>
            <AddressAutocomplete
              id="install_address_search"
              value={installDisplay}
              onChange={(v) => {
                setValue("install_address_formatted", v, { shouldDirty: true });
                setValue("install_lat", null);
                setValue("install_lng", null);
              }}
              onResolved={onInstallResolved}
              disabled={formState.isSubmitting}
            />
            {watch("install_lat") != null
              ? <p className="text-[11px] text-emerald-600">✓ Adresse géocodée — coordonnées GPS enregistrées</p>
              : <p className="text-[11px] text-muted-foreground">Sélectionnez une adresse dans la liste pour activer les suggestions de distance.</p>
            }
            {formState.errors.install_address_formatted && (
              <p className="text-destructive text-sm">{formState.errors.install_address_formatted.message}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="install_city">Ville</Label>
              <Input id="install_city" {...register("install_city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="install_postal_code">Code postal</Label>
              <Input id="install_postal_code" {...register("install_postal_code")} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sameAddress}
              onChange={(e) => handleSameAddress(e.target.checked)}
              disabled={formState.isSubmitting}
              className="rounded"
            />
            Même adresse que l&apos;installation
          </label>
        </CardContent>
      </Card>

      {/* ── Adresse de facturation ── */}
      {!sameAddress && (
        <Card>
          <CardHeader>
            <CardTitle>Adresse de facturation</CardTitle>
            <CardDescription>Adresse utilisée pour les factures (pas de GPS).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="billing_address_search">Adresse</Label>
              <AddressAutocomplete
                id="billing_address_search"
                value={billingDisplay}
                onChange={(v) => {
                  setBillingDisplay(v);
                  setValue("billing_address", v);
                }}
                onResolved={onBillingResolved}
                disabled={formState.isSubmitting}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billing_city">Ville</Label>
                <Input id="billing_city" {...register("billing_city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing_postal">Code postal</Label>
                <Input id="billing_postal" {...register("billing_postal")} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              <option value="en_attente">Va nous rappeler</option>
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
    </>
  );
}
