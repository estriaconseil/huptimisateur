"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ChevronRight, Pencil, Search, X } from "lucide-react";
import { useCallback, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { AddressAutocomplete } from "@/components/maps/address-autocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateClient, updateJob } from "@/actions/clients";
import { statusLabel, statusVariant } from "@/lib/job-status";
import { selectClass } from "@/lib/ui/form-styles";
import {
  editClientSchema,
  editJobSchema,
  type EditClientFormValues,
  type EditJobFormValues,
} from "@/lib/validations/client-job";

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  address_formatted: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  jobs: {
    id: string;
    status: string;
    estimated_duration_hours: number;
    preferred_date: string | null;
    installation_info: string | null;
    internal_notes: string | null;
  }[];
};

const JOB_STATUSES = [
  { value: "all",         label: "Tous les statuts" },
  { value: "draft",       label: "À placer" },
  { value: "scheduled",   label: "Planifiée" },
  { value: "in_progress", label: "En cours" },
  { value: "completed",   label: "Terminée" },
  { value: "cancelled",   label: "Annulée" },
] as const;

/* ─── Dialog : édition client ─── */
function EditClientDialog({ client }: { client: ClientRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const form = useForm<EditClientFormValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: {
      name: client.name,
      email: client.email ?? "",
      phone: client.phone ?? "",
      address_formatted: client.address_formatted ?? "",
      city: client.city ?? "",
      postal_code: client.postal_code ?? "",
      lat: client.lat,
      lng: client.lng,
    },
  });

  const { register, handleSubmit, formState, setValue, watch } = form;

  const onPlaceResolved = useCallback(
    (p: {
      address_raw: string;
      address_formatted: string;
      city: string;
      postal_code: string;
      lat: number | null;
      lng: number | null;
    }) => {
      setValue("address_formatted", p.address_formatted, { shouldValidate: true });
      setValue("city", p.city, { shouldValidate: true });
      setValue("postal_code", p.postal_code, { shouldValidate: true });
      setValue("lat", p.lat, { shouldValidate: true });
      setValue("lng", p.lng, { shouldValidate: true });
    },
    [setValue]
  );

  function onAddressChange(v: string) {
    setValue("address_formatted", v, { shouldDirty: true });
  }

  function submit(data: EditClientFormValues) {
    setSaveError(null);
    startTransition(async () => {
      const res = await updateClient(client.id, data);
      if (res.ok) {
        router.refresh();
      } else {
        setSaveError(res.message);
      }
    });
  }

  const latVal = watch("lat");
  const addrVal = watch("address_formatted");

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon" title="Modifier le client" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le client</DialogTitle>
          <DialogDescription>Mets à jour les informations de {client.name}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(submit)(); }} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${client.id}`}>Nom <span className="text-destructive">*</span></Label>
            <Input id={`name-${client.id}`} {...register("name")} />
            {formState.errors.name && <p className="text-destructive text-xs">{formState.errors.name.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`email-${client.id}`}>Courriel</Label>
              <Input id={`email-${client.id}`} type="email" {...register("email")} />
              {formState.errors.email && <p className="text-destructive text-xs">{formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`phone-${client.id}`}>Téléphone</Label>
              <Input id={`phone-${client.id}`} type="tel" {...register("phone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Adresse</Label>
            <AddressAutocomplete
              id={`addr-${client.id}`}
              value={addrVal ?? ""}
              onChange={onAddressChange}
              onResolved={onPlaceResolved}
              disabled={pending}
            />
            {latVal != null
              ? <p className="text-[11px] text-emerald-600">✓ Coordonnées GPS enregistrées</p>
              : <p className="text-[11px] text-muted-foreground">Sélectionner dans la liste Google pour mettre à jour les coordonnées GPS.</p>
            }
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`city-${client.id}`}>Ville</Label>
              <Input id={`city-${client.id}`} {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`postal-${client.id}`}>Code postal</Label>
              <Input id={`postal-${client.id}`} {...register("postal_code")} />
            </div>
          </div>

          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Dialog : édition job ─── */
function EditJobDialog({ job, clientName }: { job: ClientRow["jobs"][number]; clientName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const form = useForm<EditJobFormValues>({
    resolver: zodResolver(editJobSchema),
    defaultValues: {
      status: job.status as EditJobFormValues["status"],
      estimated_duration_hours: (job.estimated_duration_hours === 4 ? 4 : 8),
      preferred_date: job.preferred_date ?? "",
      installation_info: job.installation_info ?? "",
      internal_notes: job.internal_notes ?? "",
    },
  });

  const { register, handleSubmit, formState } = form;

  function submit(data: EditJobFormValues) {
    setSaveError(null);
    startTransition(async () => {
      const res = await updateJob(job.id, data);
      if (res.ok) {
        router.refresh();
      } else {
        setSaveError(res.message);
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-6 shrink-0" title="Modifier la job" />}>
        <Pencil className="size-3" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier la job</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(submit)(); }} className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`status-${job.id}`}>Statut</Label>
              <select id={`status-${job.id}`} className={selectClass} {...register("status")}>
                <option value="draft">À placer</option>
                <option value="scheduled">Planifiée</option>
                <option value="in_progress">En cours</option>
                <option value="completed">Terminée</option>
                <option value="cancelled">Annulée</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`dur-${job.id}`}>Durée</Label>
              <select
                id={`dur-${job.id}`}
                className={selectClass}
                {...register("estimated_duration_hours", { valueAsNumber: true })}
              >
                <option value={4}>4 h — Demi-journée</option>
                <option value={8}>8 h — Journée complète</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`date-${job.id}`}>Date souhaitée (optionnel)</Label>
            <Input id={`date-${job.id}`} type="date" {...register("preferred_date")} />
            {formState.errors.preferred_date && (
              <p className="text-destructive text-xs">{formState.errors.preferred_date.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`info-${job.id}`}>Information sur l&apos;installation</Label>
            <Textarea id={`info-${job.id}`} rows={3} {...register("installation_info")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`notes-${job.id}`}>Notes internes</Label>
            <Textarea id={`notes-${job.id}`} rows={2} {...register("internal_notes")} />
          </div>

          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Liste principale avec recherche + accordéon ─── */
export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((c) => {
      /* Recherche : nom, ville, téléphone, courriel */
      if (q) {
        const haystack = [c.name, c.city, c.phone, c.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      /* Filtre statut : garder le client si AU MOINS une de ses jobs correspond */
      if (statusFilter !== "all") {
        if (!c.jobs.some((j) => j.status === statusFilter)) return false;
      }
      return true;
    });
  }, [clients, search, statusFilter]);

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground text-sm">Aucun client enregistré.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barre de recherche + filtre */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client, ville, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass + " w-auto flex-none"}
        >
          {JOB_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Résumé */}
      <p className="text-xs text-muted-foreground">
        {filtered.length === clients.length
          ? `${clients.length} client${clients.length > 1 ? "s" : ""}`
          : `${filtered.length} résultat${filtered.length > 1 ? "s" : ""} sur ${clients.length}`}
      </p>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Aucun client ne correspond à la recherche.</p>
          </CardContent>
        </Card>
      )}

      {/* Liste accordéon */}
      <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
        {filtered.map((client) => {
          const isOpen = expanded.has(client.id);
          const jobsToShow = statusFilter === "all"
            ? client.jobs
            : client.jobs.filter((j) => j.status === statusFilter);

          return (
            <div key={client.id} className="bg-white dark:bg-card">
              {/* En-tête cliquable */}
              <button
                type="button"
                onClick={() => toggleExpand(client.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                {/* Chevron */}
                <span className="shrink-0 text-muted-foreground">
                  {isOpen
                    ? <ChevronDown className="size-4" />
                    : <ChevronRight className="size-4" />
                  }
                </span>

                {/* Nom */}
                <span className="flex-1 min-w-0 font-medium text-sm truncate">{client.name}</span>

                {/* Ville */}
                {client.city && (
                  <span className="hidden sm:block text-xs text-muted-foreground shrink-0">
                    📍 {client.city}
                  </span>
                )}

                {/* GPS */}
                {client.lat != null && (
                  <span className="hidden sm:block text-[10px] text-emerald-600 font-medium shrink-0">✓ GPS</span>
                )}

                {/* Nb jobs */}
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {client.jobs.length} job{client.jobs.length > 1 ? "s" : ""}
                </Badge>

                {/* Bouton modifier (stoppe la propagation pour ne pas toggle l'accordéon) */}
                <span onClick={(e) => e.stopPropagation()}>
                  <EditClientDialog client={client} />
                </span>
              </button>

              {/* Contenu accordéon */}
              {isOpen && (
                <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
                  {/* Infos client */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    {client.phone && <span>📞 {client.phone}</span>}
                    {client.email && <span>✉ {client.email}</span>}
                    {client.address_formatted && <span>🏠 {client.address_formatted}</span>}
                    <span className="text-xs">
                      Créé le {format(parseISO(client.created_at), "d MMM yyyy", { locale: fr })}
                    </span>
                  </div>

                  {/* Jobs */}
                  {jobsToShow.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Jobs
                      </p>
                      {jobsToShow.map((job) => (
                        <div
                          key={job.id}
                          className="flex flex-wrap items-center gap-2 rounded-md bg-white border border-border px-3 py-1.5 dark:bg-card"
                        >
                          <Badge variant={statusVariant(job.status)} className="text-[10px]">
                            {statusLabel(job.status)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{job.estimated_duration_hours} h</span>
                          {job.preferred_date && (
                            <span className="text-xs text-muted-foreground">
                              Souhaitée : {format(parseISO(job.preferred_date), "d MMM yyyy", { locale: fr })}
                            </span>
                          )}
                          {job.installation_info && (
                            <span className="truncate text-xs text-muted-foreground max-w-xs">
                              {job.installation_info.slice(0, 80)}
                              {job.installation_info.length > 80 ? "…" : ""}
                            </span>
                          )}
                          <span className="ml-auto">
                            <EditJobDialog job={job} clientName={client.name} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {jobsToShow.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Aucune job avec ce statut.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
