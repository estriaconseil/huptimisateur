"use client";

import { useEffect } from "react";

/** Déclenche automatiquement l'impression du navigateur (ex. ?print=1). */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [enabled]);
  return null;
}
