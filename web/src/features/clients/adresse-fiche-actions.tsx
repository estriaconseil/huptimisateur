"use client";

import { FilePlus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createJobOnExistingAddress } from "@/actions/prospects";

// ── Nouvelle soumission (vide) ─────────────────────────────────────────────────

export function NouvellesoumissionButton({
  installationAddressId,
}: {
  installationAddressId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleClick() {
    start(async () => {
      const res = await createJobOnExistingAddress({
        installationAddressId,
        mode: "blank",
      });
      if (!res.ok) {
        alert(res.message);
        return;
      }
      router.push(`/ventes/soumission/${res.jobId}`);
    });
  }

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      className="gap-1.5 text-xs h-8"
      disabled={pending}
      onClick={handleClick}
    >
      <FilePlus className="size-3.5" />
      {pending ? "Création…" : "Nouvelle soumission"}
    </Button>
  );
}

// ── Reprendre la dernière soumission (prix à zéro) ────────────────────────────

export function ReprendreButton({
  installationAddressId,
  sourceQuoteId,
  label,
}: {
  installationAddressId: string;
  /** Si absent, prend la dernière soumission du lieu automatiquement. */
  sourceQuoteId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleClick() {
    start(async () => {
      const res = await createJobOnExistingAddress({
        installationAddressId,
        mode: "duplicate",
        sourceQuoteId: sourceQuoteId ?? null,
      });
      if (!res.ok) {
        alert(res.message);
        return;
      }
      router.push(`/ventes/soumission/${res.jobId}`);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs h-8"
      disabled={pending}
      onClick={handleClick}
    >
      <RefreshCw className="size-3.5" />
      {pending ? "Copie…" : (label ?? "Reprendre (prix à zéro)")}
    </Button>
  );
}
