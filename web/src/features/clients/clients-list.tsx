"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { AddressAutocomplete } from "@/components/maps/address-autocomplete";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { updateClient } from "@/actions/clients";
import { statusColor, statusLabel } from "@/lib/job-status";
import { selectClass } from "@/lib/ui/form-styles";
import { cn } from "@/lib/utils";
import {
  editClientSchema,
  type EditClientFormValues,
} from "@/lib/validations/client-job";

export type ClientJobRow = {
  id: string;
  status: string;
  estimated_duration_hours: number;
  preferred_date: string | null;
  installation_info: string | null;
  internal_notes: string | null;
  installation_address_id: string | null;
  quote_id?: string | null;
  quote_number?: number | null;
};

export type InstallationAddressRow = {
  id: string;
  label: string | null;
  address_formatted: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  installation_info: string | null;
};

export type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_postal: string | null;
  created_at: string;
  installation_addresses: InstallationAddressRow[];
  jobs: ClientJobRow[];
};

const JOB_STATUSES = [
  { value: "all",                   label: "Tous les statuts" },
  { value: "soumission_en_attente", label: "Prospect" },
  { value: "soumission_repartie",   label: "Visite planifiée" },
  { value: "en_attente",            label: "Va nous rappeler" },
  { value: "a_planifier",           label: "À planifier" },
  { value: "reparti",               label: "Réparti" },
  { value: "retour_a_faire",        label: "Retour à faire" },
  { value: "complete",              label: "Complété" },
  { value: "termine",               label: "Terminé" },
  { value: "annule",                label: "Annulé" },
] as const;

/** Priorité pour afficher le statut « chaud » sur la ligne fermée */
const STATUS_PRIORITY: string[] = [
  "retour_a_faire",
  "a_planifier",
  "soumission_repartie",
  "soumission_en_attente",
  "en_attente",
  "reparti",
  "complete",
  "termine",
  "annule",
];

function hotStatuses(jobs: { status: string }[], limit = 2): string[] {
  const unique = [...new Set(jobs.map((j) => j.status))];
  return unique
    .sort((a, b) => {
      const ia = STATUS_PRIORITY.indexOf(a);
      const ib = STATUS_PRIORITY.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .slice(0, limit);
}

function accentBarForJobs(jobs: { status: string }[]): string {
  const hot = hotStatuses(jobs, 1)[0];
  switch (hot) {
    case "soumission_en_attente": return "bg-amber-400";
    case "soumission_repartie":   return "bg-blue-500";
    case "en_attente":            return "bg-violet-400";
    case "a_planifier":           return "bg-emerald-500";
    case "reparti":               return "bg-blue-500";
    case "retour_a_faire":        return "bg-orange-500";
    case "annule":                return "bg-red-400";
    default:                      return "bg-slate-300";
  }
}

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
      billing_address: client.billing_address ?? "",
      billing_city: client.billing_city ?? "",
      billing_postal: client.billing_postal ?? "",
    },
  });

  const { register, handleSubmit, formState, setValue } = form;

  const onBillingResolved = useCallback(
    (p: {
      address_raw: string;
      address_formatted: string;
      city: string;
      postal_code: string;
      lat: number | null;
      lng: number | null;
    }) => {
      setValue("billing_address", p.address_formatted || p.address_raw, { shouldValidate: true });
      setValue("billing_city", p.city, { shouldValidate: true });
      setValue("billing_postal", p.postal_code, { shouldValidate: true });
    },
    [setValue]
  );

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
            <Label>Adresse de facturation</Label>
            <AddressAutocomplete
              id={`billing-addr-${client.id}`}
              value={form.watch("billing_address") ?? ""}
              onChange={(v) => setValue("billing_address", v, { shouldDirty: true })}
              onResolved={onBillingResolved}
              disabled={pending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`billing-city-${client.id}`}>Ville</Label>
              <Input id={`billing-city-${client.id}`} {...register("billing_city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`billing-postal-${client.id}`}>Code postal</Label>
              <Input id={`billing-postal-${client.id}`} {...register("billing_postal")} />
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

/* ─── Helpers consolidation ─── */
function normalizeAddress(addr: string | null | undefined): string {
  return (addr ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,?\s*canada\s*$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function formatBillingLine(address: string | null, city: string | null, postal: string | null): string {
  if (!address) return "Aucune adresse de facturation";
  const lower = address.toLowerCase();
  const extras: string[] = [];
  if (city && !lower.includes(city.toLowerCase())) extras.push(city);
  if (postal && !lower.includes(postal.toLowerCase().replace(/\s/g, ""))) extras.push(postal);
  return extras.length ? `${address} — ${extras.join(" ")}` : address;
}

type Contact = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** Client le plus « riche » pour ce contact (édition) */
  primary: ClientRow;
};

type InstallBlock = {
  key: string;
  address: InstallationAddressRow;
  ids: string[];
  jobs: Array<ClientJobRow & { clientName: string }>;
};

type BillingGroup = {
  groupKey: string;
  billingAddress: string | null;
  billingCity: string | null;
  billingPostal: string | null;
  contacts: Contact[];
  /** Client principal du compte (édition facturation) */
  primaryClient: ClientRow;
  installBlocks: InstallBlock[];
  jobs: Array<ClientJobRow & { clientName: string }>;
};

/* ─── Liste principale — 1 ligne = 1 adresse de facturation ─── */
export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((c) => {
      if (q) {
        const installHay = c.installation_addresses
          .flatMap((a) => [a.address_formatted, a.city, a.postal_code, a.label])
          .filter(Boolean)
          .join(" ");
        const haystack = [c.name, c.billing_city, c.billing_address, c.billing_postal, c.phone, c.email, installHay]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all") {
        if (!c.jobs.some((j) => j.status === statusFilter)) return false;
      }
      return true;
    });
  }, [clients, search, statusFilter]);

  const groups = React.useMemo<BillingGroup[]>(() => {
    // 1. Regrouper les fiches client par adresse de facturation normalisée
    const byBilling = new Map<string, ClientRow[]>();
    for (const c of filtered) {
      const key = c.billing_address
        ? normalizeAddress(c.billing_address)
        : `__solo__${c.id}`;
      if (!key) {
        const solo = `__solo__${c.id}`;
        byBilling.set(solo, [...(byBilling.get(solo) ?? []), c]);
        continue;
      }
      byBilling.set(key, [...(byBilling.get(key) ?? []), c]);
    }

    return Array.from(byBilling.entries()).map(([groupKey, rows]) => {
      // Contact unique = nom + téléphone (évite Ex2 : mêmes noms listés 2×)
      const contactMap = new Map<string, Contact>();
      for (const c of rows) {
        const key = `${c.name.toLowerCase().trim()}|${digitsOnly(c.phone)}`;
        const existing = contactMap.get(key);
        if (!existing) {
          contactMap.set(key, {
            key,
            name: c.name,
            phone: c.phone,
            email: c.email,
            primary: c,
          });
        } else {
          // Enrichir téléphone / courriel manquants ; garder la fiche la plus ancienne comme primaire
          if (!existing.phone && c.phone) existing.phone = c.phone;
          if (!existing.email && c.email) existing.email = c.email;
          if (c.created_at < existing.primary.created_at) existing.primary = c;
          else if ((c.email || c.phone) && !existing.primary.email && !existing.primary.phone) {
            existing.primary = c;
          }
        }
      }
      const contacts = Array.from(contactMap.values());

      // Client principal = celui avec le plus de jobs, sinon le plus ancien
      const primaryClient = [...rows].sort((a, b) => {
        if (b.jobs.length !== a.jobs.length) return b.jobs.length - a.jobs.length;
        return a.created_at.localeCompare(b.created_at);
      })[0]!;

      const jobs = rows.flatMap((c) =>
        c.jobs.map((j) => ({ ...j, clientName: c.name }))
      );

      // Installations dédoublonnées par texte d'adresse (évite 151 Bertrand × 4)
      const installMap = new Map<string, InstallBlock>();
      for (const c of rows) {
        for (const a of c.installation_addresses) {
          const key = normalizeAddress(a.address_formatted) || a.id;
          const existing = installMap.get(key);
          if (!existing) {
            installMap.set(key, { key, address: a, ids: [a.id], jobs: [] });
          } else {
            if (!existing.ids.includes(a.id)) existing.ids.push(a.id);
            // Préférer la version avec GPS
            if (existing.address.lat == null && a.lat != null) existing.address = a;
          }
        }
      }

      const installBlocks = Array.from(installMap.values()).map((block) => ({
        ...block,
        jobs: jobs.filter(
          (j) => j.installation_address_id != null && block.ids.includes(j.installation_address_id)
        ),
      }));

      // Masquer les adresses d'install sans job si une autre copie fusionnée a déjà les jobs
      // (on garde toutes les blocs uniques ; les 0-job orphelins purs restent visibles)

      const first = rows[0]!;
      return {
        groupKey,
        billingAddress: first.billing_address,
        billingCity: first.billing_city,
        billingPostal: first.billing_postal,
        contacts,
        primaryClient,
        installBlocks,
        jobs,
      };
    });
  }, [filtered]);

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
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher client, facturation, installation…"
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

      <p className="text-xs text-muted-foreground">
        {groups.length} compte{groups.length > 1 ? "s" : ""} (par adresse de facturation)
        {filtered.length !== clients.length ? ` — ${filtered.length} fiche${filtered.length > 1 ? "s" : ""} filtrée${filtered.length > 1 ? "s" : ""}` : ""}
      </p>

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">Aucun client ne correspond à la recherche.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {groups.map((group) => {
          const isOpen = expanded.has(group.groupKey);
          const jobsMatching = statusFilter === "all"
            ? group.jobs
            : group.jobs.filter((j) => j.status === statusFilter);

          const addrBlocks = group.installBlocks
            .map((block) => ({
              ...block,
              jobs: statusFilter === "all"
                ? block.jobs
                : block.jobs.filter((j) => j.status === statusFilter),
            }))
            .filter((b) => statusFilter === "all" || b.jobs.length > 0);

          const linkedIds = new Set(group.installBlocks.flatMap((b) => b.ids));
          const orphanJobs = jobsMatching.filter(
            (j) => !j.installation_address_id || !linkedIds.has(j.installation_address_id)
          );

          const billingLine = formatBillingLine(
            group.billingAddress,
            group.billingCity,
            group.billingPostal
          );
          const contactNames = group.contacts.map((c) => c.name).join(", ");
          const installCount = group.installBlocks.filter(
            (b) => b.jobs.length > 0 || statusFilter === "all"
          ).length;
          const statuses = hotStatuses(group.jobs);
          const accent = accentBarForJobs(group.jobs);
          const primaryPhone = group.contacts.find((c) => c.phone)?.phone;

          return (
            <div
              key={group.groupKey}
              className={cn(
                "overflow-hidden rounded-xl border bg-white dark:bg-card shadow-sm",
                isOpen ? "border-slate-300 ring-1 ring-slate-200/80" : "border-border"
              )}
            >
              {/* Ligne compte */}
              <div className="flex items-stretch">
                <div className={cn("w-1 shrink-0", accent)} aria-hidden />
                <button
                  type="button"
                  onClick={() => toggleExpand(group.groupKey)}
                  className="flex flex-1 min-w-0 items-center gap-3 px-3 py-3 text-left hover:bg-slate-50/80 dark:hover:bg-muted/40 transition-colors"
                >
                  <span className="shrink-0 text-slate-400">
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {group.billingAddress
                        ? (group.billingCity
                          ? `${group.billingAddress.split(",")[0]}, ${group.billingCity}`
                          : group.billingAddress.split(",")[0])
                        : contactNames || "Sans adresse"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-2">
                      <span className="truncate">{contactNames || "—"}</span>
                      {primaryPhone && (
                        <span className="hidden sm:inline-flex items-center gap-1 shrink-0 text-slate-500">
                          <Phone className="size-3" />
                          {primaryPhone}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {statuses.map((s) => (
                      <span
                        key={s}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          statusColor(s)
                        )}
                      >
                        {statusLabel(s)}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
                    {installCount} inst. · {group.jobs.length} job{group.jobs.length > 1 ? "s" : ""}
                  </span>
                </button>
                <div className="shrink-0 flex items-center pr-2">
                  <EditClientDialog client={group.primaryClient} />
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-border space-y-3 p-3 bg-slate-50/60 dark:bg-muted/20">
                  {/* Facturation */}
                  <div className="rounded-lg border border-sky-200/80 bg-sky-50/70 dark:bg-sky-950/20 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400 mb-1.5">
                      Facturation
                    </p>
                    <p className="text-sm font-medium text-foreground">{billingLine}</p>
                    <div className="mt-2 space-y-1">
                      {group.contacts.map((c) => (
                        <div
                          key={c.key}
                          className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600 dark:text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">{c.name}</span>
                          {c.phone && (
                            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-sky-700 hover:underline">
                              <Phone className="size-3" />
                              {c.phone}
                            </a>
                          )}
                          {c.email && <span>{c.email}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Installations */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 px-0.5">
                      Adresses d&apos;installation
                    </p>

                    {addrBlocks.length === 0 && orphanJobs.length === 0 && (
                      <p className="text-xs text-muted-foreground italic px-0.5">Aucune adresse d&apos;installation.</p>
                    )}

                    {addrBlocks.map((block) => {
                      if (block.jobs.length === 0 && group.installBlocks.some((b) => b.jobs.length > 0)) {
                        return null;
                      }
                      const addr = block.address;
                      return (
                        <div
                          key={block.key}
                          className="rounded-lg border border-emerald-200/70 bg-white dark:bg-card overflow-hidden shadow-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-emerald-50/80 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40">
                            <MapPin className="size-3.5 text-emerald-600 shrink-0" />
                            <span className="text-sm font-medium truncate flex-1 min-w-0">
                              {addr.address_formatted || addr.label || "Adresse sans nom"}
                            </span>
                            {addr.lat != null && (
                              <span className="text-[10px] text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-1.5 py-0.5 font-medium">
                                ✓ GPS
                              </span>
                            )}
                            <span className="text-[11px] text-emerald-800/70 tabular-nums ml-auto">
                              {block.jobs.length} job{block.jobs.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {block.jobs.length > 0 ? (
                            <div className="divide-y divide-border">
                              {block.jobs.map((job) => (
                                <JobRow key={job.id} job={job} />
                              ))}
                            </div>
                          ) : (
                            <p className="px-3 py-2 text-xs text-muted-foreground italic">
                              Aucune job liée à cette adresse.
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {orphanJobs.length > 0 && (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white dark:bg-card overflow-hidden">
                        <div className="px-3 py-2 bg-slate-100/80 border-b border-border">
                          <span className="text-sm font-medium text-muted-foreground">
                            Jobs sans adresse d&apos;installation
                          </span>
                        </div>
                        <div className="divide-y divide-border">
                          {orphanJobs.map((job) => (
                            <JobRow key={job.id} job={job} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function jobFicheLink(status: string, jobId: string): { href: string; label: string } {
  if (
    status === "soumission_en_attente" ||
    status === "soumission_repartie" ||
    status === "en_attente"
  ) {
    return { href: `/ventes/pipeline?job=${jobId}`, label: "Fiche prospect" };
  }
  if (status === "a_planifier" || status === "reparti" || status === "retour_a_faire") {
    return { href: `/a-planifier?job=${jobId}`, label: "Fiche installation" };
  }
  return { href: `/ventes/soumission/${jobId}`, label: "Voir la job" };
}

function JobRow({ job }: { job: ClientJobRow & { clientName?: string }; clientName?: string }) {
  const hasQuote = !!job.quote_id || !!job.quote_number;
  const fiche = jobFicheLink(job.status, job.id);
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium",
          statusColor(job.status)
        )}
      >
        {statusLabel(job.status)}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{job.estimated_duration_hours} h</span>
      {job.preferred_date && (
        <span className="text-xs text-muted-foreground">
          Souhaitée : {format(parseISO(job.preferred_date), "d MMM yyyy", { locale: fr })}
        </span>
      )}
      {job.installation_info && (
        <span className="truncate text-xs text-muted-foreground max-w-[12rem] sm:max-w-xs">
          {job.installation_info.slice(0, 80)}
          {job.installation_info.length > 80 ? "…" : ""}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Link
          href={fiche.href}
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "h-7 gap-1 text-xs"
          )}
        >
          <ExternalLink className="size-3.5" />
          {fiche.label}
        </Link>
        <Link
          href={`/ventes/soumission/${job.id}`}
          className={cn(
            buttonVariants({ variant: hasQuote ? "secondary" : "outline", size: "sm" }),
            "h-7 gap-1 text-xs"
          )}
        >
          <FileText className="size-3.5" />
          {hasQuote && job.quote_number
            ? `#${job.quote_number}`
            : hasQuote
              ? "Soumission"
              : "Créer soumission"}
        </Link>
      </div>
    </div>
  );
}
