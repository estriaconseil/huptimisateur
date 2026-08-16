"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { duplicateQuote } from "@/actions/sales";

type Props = {
  quoteId: string;
  jobId: string;
};

export function DuplicateQuoteButton({ quoteId, jobId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    // Lie la copie au même job → devient la version active (la plus récente)
    const res = await duplicateQuote(quoteId, jobId);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-8"
        disabled={pending}
        onClick={handleClick}
      >
        <Copy className="size-3.5" />
        {pending ? "Duplication…" : "Dupliquer (prix à zéro)"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
