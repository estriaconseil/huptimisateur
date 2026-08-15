"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Mail, RefreshCw, ShieldAlert } from "lucide-react";

import {
  sendInterruptionBackupNow,
  updateInterruptionRecipients,
} from "@/actions/interruption";

type LastRun = {
  generated_at: string;
  period_start: string;
  period_end: string;
  status: string;
  email_status: string | null;
  error_message: string | null;
  recipient_count: number;
  is_retry: boolean;
} | null;

type Props = {
  isAdmin: boolean;
  recipients: string[];
  lastRun: LastRun;
};

function statusLabel(run: NonNullable<LastRun>): string {
  if (run.email_status === "sent") return "Courriel envoyé";
  if (run.email_status === "failed") return "PDF stocké — échec courriel";
  if (run.status === "stored") return "PDF stocké";
  if (run.status === "failed") return "Échec";
  return run.status;
}

export function InterruptionClient({ isAdmin, recipients, lastRun }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recipientsText, setRecipientsText] = useState(recipients.join("\n"));

  const sendNow = () => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await sendInterruptionBackupNow();
      if (res.ok) {
        setMsg(res.message);
        router.refresh();
      } else setErr(res.message);
    });
  };

  const saveRecipients = () => {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await updateInterruptionRecipients(recipientsText);
      if (res.ok) {
        setMsg("Destinataires enregistrés");
        router.refresh();
      } else setErr(res.message);
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex gap-2 font-medium">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" aria-hidden />
          À quoi ça sert
        </div>
        <p className="mt-2 text-amber-900/90 dark:text-amber-100/80">
          Chaque jour ouvrable à <strong>6h (Québec)</strong>, un PDF des horaires ventes +
          installations (2 semaines) est envoyé par courriel. Si le site est en panne, tu as
          encore le dernier PDF dans ta boîte et dans Supabase Storage. Retry automatique vers
          7h si l&apos;envoi a échoué.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dernier envoi
        </h2>
        {lastRun ? (
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Quand</dt>
              <dd>
                {new Date(lastRun.generated_at).toLocaleString("fr-CA", {
                  timeZone: "America/Toronto",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Statut</dt>
              <dd className="font-medium">{statusLabel(lastRun)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Période</dt>
              <dd>
                {lastRun.period_start} → {lastRun.period_end}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Destinataires</dt>
              <dd>{lastRun.recipient_count}</dd>
            </div>
            {lastRun.error_message && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Erreur</dt>
                <dd className="text-destructive">{lastRun.error_message}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun envoi encore.</p>
        )}
      </section>

      <section className="flex flex-wrap gap-3">
        <a
          href="/api/interruption/download"
          className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Download className="size-4" aria-hidden />
          Télécharger le PDF
        </a>
        <button
          type="button"
          onClick={sendNow}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Mail className="size-4" aria-hidden />
          {pending ? "Envoi…" : "Envoyer maintenant"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="size-4" aria-hidden />
          Actualiser
        </button>
      </section>

      {isAdmin && (
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Destinataires (admin)
          </h2>
          <p className="text-xs text-muted-foreground">
            Un courriel par ligne (ou séparés par des virgules). Pour l&apos;instant : toi ;
            tu pourras ajouter les secrétaires plus tard.
          </p>
          <textarea
            className="w-full min-h-[88px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
          />
          <button
            type="button"
            onClick={saveRecipients}
            disabled={pending}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Enregistrer les destinataires
          </button>
        </section>
      )}

      {msg && (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
