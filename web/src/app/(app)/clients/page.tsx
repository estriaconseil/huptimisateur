import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { searchClients } from "@/actions/clients";
import { getCurrentSalespersonId } from "@/lib/supabase/profile";
import { ClientsSearchInput, ClientsSearchResults } from "@/features/clients/clients-search";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // Vendeur connecté → filtre automatique + affichage de tous ses clients sans recherche
  const currentSalespersonId = await getCurrentSalespersonId();

  const results =
    query.length >= 2 || currentSalespersonId
      ? await searchClients(query, currentSalespersonId).then((r) => (r.ok ? r.data : []))
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Base de données clients</h1>
          <p className="text-muted-foreground text-sm">
            Recherchez par nom, téléphone, ville ou adresse d&apos;installation — puis cliquez sur une adresse pour voir l&apos;historique complet.
          </p>
        </div>
        <Link href="/nouveau" className={buttonVariants({ size: "sm" })}>
          <PlusCircle className="size-3.5" />
          Nouveau client / job
        </Link>
      </div>

      <Suspense>
        <ClientsSearchInput initialQ={query} />
      </Suspense>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Recherche…</p>}>
        <ClientsSearchResults results={results} query={query} />
      </Suspense>
    </div>
  );
}
