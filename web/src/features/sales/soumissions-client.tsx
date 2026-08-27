"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

function buildHref(page: number, q: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/ventes/soumissions?${qs}` : "/ventes/soumissions";
}

/** Barre de recherche seule (liste rendue côté serveur). */
export function SoumissionsSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setQuery(initialQuery);
  }, [initialQuery]);

  const navigate = useCallback(
    (pageNum: number, q: string) => {
      startTransition(() => {
        router.replace(buildHref(pageNum, q), { scroll: false });
      });
    },
    [router]
  );

  const handleChange = useCallback(
    (val: string) => {
      setQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const trimmed = val.trim();
        const isNum = /^\s*#?\s*\d+\s*$/.test(trimmed);
        if (trimmed.length === 0) {
          navigate(1, "");
        } else if (isNum || trimmed.length >= 2) {
          navigate(1, trimmed);
        }
      }, 300);
    },
    [navigate]
  );

  function handleClear() {
    setQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate(1, "");
  }

  return (
    <div className="relative w-full sm:w-96">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="N°, nom du prospect ou courriel…"
        className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Effacer la recherche"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
