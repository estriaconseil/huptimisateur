"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, MessageSquare, Plus, Send, Trash2 } from "lucide-react";

import { addJobNote, deleteJobNote, getJobNotes, type JobNote } from "@/actions/notes";
import { getActivityLog, type ActivityEntry } from "@/actions/activity";
import { activityLabel } from "@/lib/activity-labels";
import { Button } from "@/components/ui/button";

type TimelineItem =
  | { kind: "note"; note: JobNote }
  | { kind: "activity"; entry: ActivityEntry };

function sortedTimeline(notes: JobNote[], entries: ActivityEntry[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...notes.map((n): TimelineItem => ({ kind: "note", note: n })),
    ...entries.map((e): TimelineItem => ({ kind: "activity", entry: e })),
  ];
  items.sort((a, b) => {
    const dateA = a.kind === "note" ? a.note.created_at : a.entry.created_at;
    const dateB = b.kind === "note" ? b.note.created_at : b.entry.created_at;
    return dateB.localeCompare(dateA); // plus récent en premier
  });
  return items;
}

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
  } catch {
    return iso;
  }
}

export function JobTimeline({ jobId }: { jobId: string }) {
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [notesRes, actRes] = await Promise.all([
      getJobNotes(jobId),
      getActivityLog(jobId),
    ]);
    if (notesRes.ok) setNotes(notesRes.notes);
    if (actRes.ok) setActivity(actRes.entries);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { void reload(); }, [reload]);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    setError(null);
    startSave(async () => {
      const res = await addJobNote(jobId, newNote.trim());
      if (!res.ok) { setError(res.message); return; }
      setNewNote("");
      await reload();
    });
  };

  const handleDelete = (noteId: string) => {
    startDelete(async () => {
      await deleteJobNote(noteId, jobId);
      await reload();
    });
  };

  const timeline = sortedTimeline(notes, activity);

  return (
    <div className="space-y-4">
      {/* Zone de saisie */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <textarea
          ref={textareaRef}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px]"
          placeholder="Ajouter une note…"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
          }}
        />
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end">
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
          >
            <Send className="size-3.5" />
            {saving ? "Envoi…" : "Ajouter"}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Chargement…</p>
      ) : timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Aucune note ni activité enregistrée.
        </p>
      ) : (
        <ul className="space-y-2">
          {timeline.map((item) => {
            if (item.kind === "note") {
              const n = item.note;
              return (
                <li key={`note-${n.id}`} className="rounded-lg border bg-background p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="size-3 shrink-0 text-primary" />
                      <span className="font-medium text-foreground">{n.author_name ?? "Utilisateur"}</span>
                      <span>·</span>
                      <span>{fmtDate(n.created_at)}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(n.id)}
                      disabled={deleting}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Supprimer la note"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                </li>
              );
            } else {
              const e = item.entry;
              return (
                <li
                  key={`act-${e.id}`}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground"
                >
                  <Clock className="size-3 shrink-0 mt-0.5 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <span>{activityLabel(e.action, e.details)}</span>
                    {e.actor_name && (
                      <span className="ml-1 opacity-70">— {e.actor_name}</span>
                    )}
                    <span className="ml-1 opacity-50">{fmtDate(e.created_at)}</span>
                  </div>
                </li>
              );
            }
          })}
        </ul>
      )}
    </div>
  );
}
