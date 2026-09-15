"use client";

import { MapPin, Phone, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { statusColor, statusLabel } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import type { ClientSearchResult } from "@/actions/clients";

// ── Priorité statut chaud ──────────────────────────────────────────────────────
const STATUS_PRIORITY = [
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

function hotStatus(jobs: { status: string }[]): string | null {
  if (jobs.length === 0) return null;
  return [...jobs]
    .sort((a, b) => {
      const ia = STATUS_PRIORITY.indexOf(a.status);
      const ib = STATUS_PRIORITY.indexOf(b.status);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })[0]!.status;
}

// ── Barre de recherche (client) ───────────────────────────────────────────────
export function ClientsSearchInput({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync quand le parent recharge avec un initialQ différent (ex. retour arrière),
  // mais pas pendant que l'utilisateur tape (évite d'effacer le dernier caractère).
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setValue(initialQ);
  }, [initialQ]);

  const handleChange = useCallback(
    (val: string) => {
      setValue(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams();
        if (val.trim().length >= 2) params.set("q", val.trim());
        startTransition(() => {
          router.replace(`/clients${params.size ? `?${params}` : ""}`, { scroll: false });
        });
      }, 300);
    },
    [router]
  );

  function handleClear() {
    setValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.replace("/clients", { scroll: false });
  }

  return (
    <div className="relative flex-1 min-w-[240px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        autoFocus
        placeholder="Nom, téléphone, ville ou adresse d'installation…"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-8 h-9 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Résultats ─────────────────────────────────────────────────────────────────
export function ClientsSearchResults({
  results,
  query,
}: {
  results: ClientSearchResult[];
  query: string;
}) {
  const hasQuery = query.trim().length >= 2;

  // État vide sans recherche (admins/secrétaires) — les vendeurs reçoivent leurs
  // clients pré-chargés, donc `results` n'est pas vide dans ce cas.
  if (!hasQuery && results.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <Search className="mx-auto mb-3 size-8 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm font-medium">Tapez au moins 2 caractères pour rechercher</p>
          <p className="text-muted-foreground/70 text-xs mt-1">Recherche par nom, téléphone, ville ou adresse d&apos;installation</p>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground text-sm">Aucun client ne correspond à «&nbsp;{query}&nbsp;».</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {hasQuery
          ? `${results.length} résultat${results.length > 1 ? "s" : ""}${results.length === 25 ? " (25 max affichés)" : ""}`
          : `${results.length} client${results.length > 1 ? "s" : ""} assigné${results.length > 1 ? "s" : ""}`}
      </p>

      {results.map((client) => {
        const allJobsForClient = client.jobs;
        const hot = hotStatus(allJobsForClient);

        return (
          <div
            key={client.id}
            className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden"
          >
            {/* En-tête client */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50/60 dark:bg-muted/20 border-b border-border">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{client.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  {client.phone && (
                    <a
                      href={`tel:${client.phone}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-sky-700 hover:underline"
                    >
                      <Phone className="size-3" />
                      {client.phone}
                    </a>
                  )}
                  {client.billing_city && (
                    <span className="text-xs text-muted-foreground">{client.billing_city}</span>
                  )}
                  {client.email && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{client.email}</span>
                  )}
                </div>
              </div>
              {hot && (
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", statusColor(hot))}>
                  {statusLabel(hot)}
                </span>
              )}
              <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
                {allJobsForClient.length} job{allJobsForClient.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Adresses d'installation */}
            {client.installation_addresses.length === 0 ? (
              <div className="px-4 py-2.5">
                <p className="text-xs text-muted-foreground italic">Aucune adresse d&apos;installation</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {client.installation_addresses.map((addr) => {
                  const addrJobs = client.jobs.filter(
                    (j) => j.installation_address_id === addr.id
                  );
                  const addrHot = hotStatus(addrJobs);

                  return (
                    <Link
                      key={addr.id}
                      href={`/clients/adresse/${addr.id}`}
                      className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition-colors group"
                    >
                      <MapPin className="size-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground group-hover:text-emerald-800 dark:group-hover:text-emerald-300 truncate">
                          {addr.address_formatted || addr.label || "Adresse sans texte"}
                        </p>
                        {addr.city &&
                          !(addr.address_formatted ?? "").toLowerCase().includes(addr.city.toLowerCase()) && (
                          <p className="text-xs text-muted-foreground">{addr.city}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {addr.lat != null && (
                          <span className="text-[9px] text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-1.5 py-0.5 font-medium">
                            GPS
                          </span>
                        )}
                        {addrHot && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColor(addrHot))}>
                            {statusLabel(addrHot)}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {addrJobs.length} job{addrJobs.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
