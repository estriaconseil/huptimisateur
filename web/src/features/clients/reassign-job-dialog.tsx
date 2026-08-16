"use client";

import { UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
import { searchClients } from "@/actions/clients";
import { reassignJobToClient } from "@/actions/clients";
import { cn } from "@/lib/utils";
import type { ClientSearchResult } from "@/actions/clients";

type Props = {
  jobId: string;
  currentClientName: string;
};

export function ReassignJobDialog({ jobId, currentClientName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [selected, setSelected] = useState<ClientSearchResult | null>(null);
  const [selectedAddrId, setSelectedAddrId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startSearch] = useTransition();
  const [saving, setSaving] = useState(false);

  function handleQueryChange(val: string) {
    setQuery(val);
    setSelected(null);
    setSelectedAddrId(null);
    if (val.trim().length < 2) {
      setResults([]);
      return;
    }
    startSearch(async () => {
      const res = await searchClients(val);
      if (res.ok) setResults(res.data);
    });
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await reassignJobToClient(jobId, selected.id, selectedAddrId);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" />}>
        <UserCheck className="size-3.5" />
        Réassigner le client
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Réassigner la job à un autre client</DialogTitle>
          <DialogDescription>
            Client actuel : <strong>{currentClientName}</strong>. Les noms sur les soumissions existantes ne seront pas modifiés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Rechercher un client</Label>
            <Input
              placeholder="Nom, téléphone ou ville…"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    setSelectedAddrId(null);
                    setResults([]);
                    setQuery(c.name);
                  }}
                  className={cn(
                    "w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors",
                    selected?.id === c.id && "border-sky-400 bg-sky-50/60 dark:bg-sky-950/20"
                  )}
                >
                  <p className="font-medium">{c.name}</p>
                  {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  {c.billing_city && <p className="text-xs text-muted-foreground">{c.billing_city}</p>}
                </button>
              ))}
            </div>
          )}

          {selected && selected.installation_addresses.length > 0 && (
            <div className="space-y-1.5">
              <Label>Adresse d&apos;installation (optionnel)</Label>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedAddrId(null)}
                  className={cn(
                    "w-full text-left rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors",
                    selectedAddrId === null && "border-sky-400 bg-sky-50/60"
                  )}
                >
                  Aucune (conserver l&apos;adresse actuelle)
                </button>
                {selected.installation_addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAddrId(a.id)}
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-muted/40 transition-colors",
                      selectedAddrId === a.id && "border-emerald-400 bg-emerald-50/60"
                    )}
                  >
                    {a.address_formatted || a.label || "Adresse sans texte"}
                    {a.city && <span className="text-muted-foreground"> — {a.city}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button disabled={!selected || saving} onClick={handleSave}>
            {saving ? "Enregistrement…" : "Réassigner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
