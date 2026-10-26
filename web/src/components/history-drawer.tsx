"use client";

import { useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { History, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getAuditLog,
  getAuditLogMulti,
  type AuditEntry,
  type AuditSource,
} from "@/actions/audit";
import {
  diffFields,
  auditSummary,
  EMPTY_AUDIT_LOOKUPS,
  type AuditLookups,
} from "@/lib/audit-utils";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const OPERATION_COLORS: Record<string, string> = {
  INSERT: "text-emerald-700",
  UPDATE: "text-blue-700",
  DELETE: "text-red-700",
};

const OPERATION_DOT: Record<string, string> = {
  INSERT: "bg-emerald-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
};

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row individuelle de la timeline
// ─────────────────────────────────────────────────────────────────────────────

function AuditEntryRow({ entry, lookups }: { entry: AuditEntry; lookups: AuditLookups }) {
  const [expanded, setExpanded] = useState(false);
  const changes = entry.operation === "UPDATE"
    ? diffFields(entry.old_data, entry.new_data, lookups)
    : [];

  return (
    <li className="flex gap-3 pb-4 last:pb-0">
      {/* Ligne verticale + point */}
      <div className="flex flex-col items-center">
        <span className={cn("size-2 rounded-full mt-1 shrink-0", OPERATION_DOT[entry.operation])} />
        <span className="w-px flex-1 bg-border mt-1" />
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {entry.source_label && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {entry.source_label}
            </span>
          )}
          <span className={cn("text-xs font-semibold", OPERATION_COLORS[entry.operation])}>
            {auditSummary(entry).split("—")[0].trim()}
          </span>
          {entry.changed_by && (
            <span className="text-xs font-medium text-foreground">par {entry.changed_by}</span>
          )}
          <span className="text-[11px] text-muted-foreground">{fmtDate(entry.changed_at)}</span>
        </div>

        {/* Champs modifiés (UPDATE) */}
        {entry.operation === "UPDATE" && changes.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded
                ? <ChevronDown className="size-3" />
                : <ChevronRight className="size-3" />}
              {changes.length} champ{changes.length > 1 ? "s" : ""} modifié{changes.length > 1 ? "s" : ""}
            </button>

            {expanded && (
              <ul className="mt-1.5 space-y-1 pl-1">
                {changes.map((c) => (
                  <li key={c.field} className="text-[11px] leading-snug">
                    <span className="font-medium text-foreground">{c.label} :</span>
                    {" "}
                    <span className="line-through text-muted-foreground/70">{c.from}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="text-foreground font-medium">{c.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  /** Label affiché dans l'en-tête du drawer (ex: "Christian Vanasse") */
  label: string;
  /** Classes CSS supplémentaires pour le bouton déclencheur */
  triggerClassName?: string;
  /**
   * "icon"  → petite icône seule (cartes calendrier)
   * "button" → bouton avec libellé « Historique » (modales / fiches)
   */
  variant?: "icon" | "button";
} & (
  | {
      /** Une seule table (comportement simple) */
      tableName: string;
      recordId: string;
      sources?: never;
    }
  | {
      /** Plusieurs tables liées (ex: RDV + client + job) */
      sources: AuditSource[];
      tableName?: never;
      recordId?: never;
    }
);

export function HistoryDrawer(props: Props) {
  const { label, triggerClassName, variant = "icon" } = props;
  const [open, setOpen]       = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [lookups, setLookups] = useState<AuditLookups>(EMPTY_AUDIT_LOOKUPS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = props.sources
      ? await getAuditLogMulti(props.sources)
      : await getAuditLog(props.tableName, props.recordId);
    setLoading(false);
    if (res.ok) {
      setEntries(res.entries);
      setLookups(res.lookups);
    } else {
      setLoadError(res.message);
    }
  }, [props]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation(); // évite d'ouvrir la carte parente
    setOpen(true);
    setEntries(null);
    setLookups(EMPTY_AUDIT_LOOKUPS);
    void load();
  };

  return (
    <>
      {/* Bouton déclencheur */}
      <button
        type="button"
        title="Historique des modifications"
        onClick={handleOpen}
        className={cn(
          variant === "button"
            ? "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            : "inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
          triggerClassName
        )}
      >
        <History className="size-3.5" />
        {variant === "button" ? (
          <span>Historique</span>
        ) : (
          <span className="sr-only">Historique</span>
        )}
      </button>

      {/* Drawer latéral */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md !z-[60]"
          overlayClassName="!z-[60]"
        >
          {/* En-tête */}
          <SheetHeader className="border-b px-4 py-3 gap-0.5">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground shrink-0" />
              <SheetTitle>Historique</SheetTitle>
            </div>
            <p className="text-xs text-muted-foreground truncate pl-6">{label}</p>
          </SheetHeader>

          {/* Corps — timeline */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Chargement…</span>
              </div>
            )}

            {loadError && (
              <p className="text-sm text-destructive py-6 text-center">{loadError}</p>
            )}

            {!loading && !loadError && entries !== null && entries.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Aucun historique enregistré.
              </p>
            )}

            {!loading && entries && entries.length > 0 && (
              <ul className="pt-1">
                {entries.map((entry) => (
                  <AuditEntryRow key={entry.id} entry={entry} lookups={lookups} />
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
