"use client";

import { AlertTriangle, PlusCircle, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createTeam, deleteTeam, updateTeamActive } from "@/actions/teams";
import { assignTechnicianToTeam, removeTechnicianFromTeam } from "@/actions/technicians";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Team, Technician, UserRole } from "@/types/domain";

type TeamWithTechs = Team & { technicians: Technician[] };

type Props = {
  teams: TeamWithTechs[];
  allTechnicians: Technician[];
  role: UserRole;
};

export function TeamsManager({ teams, allTechnicians, role }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === "admin";

  /* ── Creation equipe ──────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  function handleCreate() {
    const name = nameRef.current?.value ?? "";
    if (!name.trim()) { setCreateError("Le nom est requis."); return; }
    setCreateError(null);
    startTransition(async () => {
      const res = await createTeam({
        name: name.trim(),
        color: colorRef.current?.value || null,
        notes: notesRef.current?.value || null,
      });
      if (!res.ok) { setCreateError(res.message); return; }
      setCreateOpen(false);
      router.refresh();
    });
  }

  /* ── Suppression equipe ───────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteTeam(deleteTarget.id);
      if (!res.ok) { setDeleteError(res.message); return; }
      setDeleteTarget(null);
      router.refresh();
    });
  }

  /* ── Activer / desactiver ─────────────────────────────── */
  function toggleActive(team: Team, checked: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await updateTeamActive(team.id, checked);
      if (!res.ok) { setError(res.message); return; }
      router.refresh();
    });
  }

  /* ── Gestion techniciens par equipe ───────────────────── */
  const [techTeam, setTechTeam] = useState<TeamWithTechs | null>(null);
  const [techError, setTechError] = useState<string | null>(null);

  function toggleTechAssign(techId: string, alreadyAssigned: boolean) {
    if (!techTeam) return;
    setTechError(null);
    startTransition(async () => {
      const res = alreadyAssigned
        ? await removeTechnicianFromTeam(techTeam.id, techId)
        : await assignTechnicianToTeam(techTeam.id, techId);
      if (!res.ok) { setTechError(res.message); return; }
      router.refresh();
    });
  }

  /* Techniciens de l'equipe courante dans le dialog (live depuis teams) */
  const currentTeamTechIds = new Set(
    (techTeam ? (teams.find((t) => t.id === techTeam.id)?.technicians ?? []) : []).map(
      (t) => t.id
    )
  );

  /* Map technicien_id → nom de l'equipe où il est DÉJÀ assigné (hors equipe courante) */
  const techAlreadyInTeam = new Map<string, string>();
  for (const team of teams) {
    if (techTeam && team.id === techTeam.id) continue;
    for (const tech of team.technicians) {
      techAlreadyInTeam.set(tech.id, team.name);
    }
  }

  return (
    <div className="space-y-6">
      {/* Role + bouton Nouvelle equipe */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">Ton role :</span>
          {isAdmin ? <Badge>Administrateur</Badge> : <Badge variant="secondary">Secretaire</Badge>}
        </div>

        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
              <PlusCircle className="size-3.5" />
              Nouvelle equipe
            </DialogTrigger>

            <DialogContent className="sm:max-w-md" showCloseButton>
              <DialogHeader>
                <DialogTitle>Creer une equipe</DialogTitle>
                <DialogDescription>
                  L&apos;equipe sera active immediatement et visible dans le calendrier.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="team-name">Nom de l&apos;equipe *</Label>
                  <Input
                    id="team-name"
                    ref={nameRef}
                    placeholder="ex : Equipe A"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="team-color">Couleur (optionnel)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="team-color"
                      ref={colorRef}
                      type="color"
                      defaultValue="#3b82f6"
                      className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-1"
                    />
                    <span className="text-muted-foreground text-xs">
                      Pastille dans le calendrier
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="team-notes">Notes internes (optionnel)</Label>
                  <Textarea
                    id="team-notes"
                    ref={notesRef}
                    placeholder="ex : Specialite climatisation..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
                {createError && (
                  <p className="text-destructive text-sm" role="alert">{createError}</p>
                )}
              </div>

              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={pending} />}>
                  Annuler
                </DialogClose>
                <Button onClick={handleCreate} disabled={pending}>
                  {pending ? "Creation..." : "Creer l'equipe"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isAdmin && (
        <p className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          Acces en lecture seule. Un administrateur peut creer ou modifier les equipes.
        </p>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Liste des equipes</CardTitle>
          <CardDescription>
            {teams.length} equipe{teams.length > 1 ? "s" : ""} — les inactives sont grises au
            calendrier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Actif</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead className="w-24">Couleur</TableHead>
                <TableHead>Techniciens</TableHead>
                <TableHead>Notes</TableHead>
                {isAdmin && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id} className={team.active ? "" : "opacity-60"}>
                  <TableCell>
                    <Checkbox
                      checked={team.active}
                      disabled={!isAdmin || pending}
                      onCheckedChange={(v) => toggleActive(team, v === true)}
                      aria-label={`Equipe ${team.name} active`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>
                    {team.color ? (
                      <span
                        className="inline-block size-6 rounded border"
                        style={{ backgroundColor: team.color }}
                        title={team.color}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {team.technicians.length === 0 ? (
                      <span className="text-muted-foreground text-sm">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {team.technicians.map((tech) => (
                          <Badge key={tech.id} variant="secondary" className="text-[11px]">
                            {tech.first_name} {tech.last_name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                    {team.notes ?? "—"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => { setTechError(null); setTechTeam(team); }}
                          aria-label={`Techniciens de ${team.name}`}
                          title="Gerer les techniciens"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Users className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => { setDeleteError(null); setDeleteTarget(team); }}
                          aria-label={`Supprimer ${team.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Dialog : techniciens de l'equipe ──────────── */}
      <Dialog open={techTeam !== null} onOpenChange={(o) => { if (!o) setTechTeam(null); }}>
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              Techniciens — {techTeam?.name}
            </DialogTitle>
            <DialogDescription>
              Coche les techniciens a assigner a cette equipe.
            </DialogDescription>
          </DialogHeader>

          {allTechnicians.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Aucun technicien disponible. Ajoute-en depuis la page{" "}
              <strong>Techniciens</strong>.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto space-y-1 py-1 pr-1">
              {allTechnicians.map((tech) => {
                const assigned = currentTeamTechIds.has(tech.id);
                const otherTeam = techAlreadyInTeam.get(tech.id);
                const isBlocked = !assigned && !!otherTeam;
                const isDisabled = pending || !tech.active || isBlocked;

                return (
                  <li
                    key={tech.id}
                    className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${
                      isBlocked ? "opacity-50" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      id={`tech-${tech.id}`}
                      checked={assigned}
                      disabled={isDisabled}
                      onCheckedChange={() => !isBlocked && toggleTechAssign(tech.id, assigned)}
                    />
                    <label
                      htmlFor={`tech-${tech.id}`}
                      className={`flex flex-1 items-baseline gap-2 text-sm ${
                        isDisabled ? "cursor-not-allowed" : "cursor-pointer"
                      } ${!tech.active ? "line-through text-muted-foreground" : ""}`}
                    >
                      <span>{tech.first_name} {tech.last_name}</span>
                      {isBlocked && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          Déjà dans {otherTeam}
                        </span>
                      )}
                      {!tech.active && (
                        <span className="text-[10px] uppercase text-muted-foreground">inactif</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {techError && (
            <p className="text-destructive text-sm" role="alert">{techError}</p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Fermer
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : confirmation suppression equipe ──── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <div className="space-y-1">
                <DialogTitle>
                  Supprimer &laquo;&nbsp;{deleteTarget?.name}&nbsp;&raquo; ?
                </DialogTitle>
                <DialogDescription>
                  Cette action est <strong>irreversible</strong>. Si l&apos;equipe a des
                  creneaux planifies, la suppression sera{" "}
                  <strong>automatiquement bloquee</strong> et aucune donnee ne sera perdue.
                  <br />
                  <br />
                  Pour retirer l&apos;equipe du calendrier sans supprimer son historique,{" "}
                  <strong>desactive-la plutot</strong> avec la case a cocher.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {deleteError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-destructive text-sm">{deleteError}</p>
            </div>
          )}

          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={pending} />}
              onClick={() => setDeleteTarget(null)}
            >
              Annuler
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
              className="bg-destructive/90 hover:bg-destructive text-white"
            >
              {pending ? "Suppression..." : "Oui, supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
