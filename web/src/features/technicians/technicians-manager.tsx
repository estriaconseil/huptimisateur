"use client";

import { PlusCircle, Pencil, Trash2, AlertTriangle, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  createTechnician,
  deleteTechnician,
  updateTechnician,
} from "@/actions/technicians";
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
import type { Technician, UserRole } from "@/types/domain";

type Props = {
  technicians: Technician[];
  role: UserRole;
};

type EditState = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

export function TechniciansManager({ technicians, role }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isAdmin = role === "admin";

  /* ── Création ─────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  function handleCreate() {
    const first_name = firstRef.current?.value ?? "";
    const last_name = lastRef.current?.value ?? "";
    if (!first_name.trim() || !last_name.trim()) {
      setCreateError("Le prenom et le nom sont requis.");
      return;
    }
    setCreateError(null);
    startTransition(async () => {
      const res = await createTechnician({
        first_name,
        last_name,
        email: emailRef.current?.value || null,
        phone: phoneRef.current?.value || null,
      });
      if (!res.ok) { setCreateError(res.message); return; }
      setCreateOpen(false);
      router.refresh();
    });
  }

  /* ── Edition inline ───────────────────────────────────── */
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(t: Technician) {
    setEditState({
      id: t.id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email ?? "",
      phone: t.phone ?? "",
    });
    setEditError(null);
  }

  function handleSaveEdit() {
    if (!editState) return;
    if (!editState.first_name.trim() || !editState.last_name.trim()) {
      setEditError("Le prenom et le nom sont requis.");
      return;
    }
    setEditError(null);
    startTransition(async () => {
      const res = await updateTechnician(editState.id, {
        first_name: editState.first_name,
        last_name: editState.last_name,
        email: editState.email || null,
        phone: editState.phone || null,
      });
      if (!res.ok) { setEditError(res.message); return; }
      setEditState(null);
      router.refresh();
    });
  }

  function toggleActive(t: Technician, checked: boolean) {
    startTransition(async () => {
      await updateTechnician(t.id, { active: checked });
      router.refresh();
    });
  }

  /* ── Suppression ──────────────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState<Technician | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteTechnician(deleteTarget.id);
      if (!res.ok) { setDeleteError(res.message); return; }
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">Ton role :</span>
          {isAdmin ? <Badge>Administrateur</Badge> : <Badge variant="secondary">Secretaire</Badge>}
        </div>

        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
              <PlusCircle className="size-3.5" />
              Nouveau technicien
            </DialogTrigger>

            <DialogContent className="sm:max-w-md" showCloseButton>
              <DialogHeader>
                <DialogTitle>Ajouter un technicien</DialogTitle>
                <DialogDescription>
                  Le technicien sera actif immediatement et pourra etre assigne a une equipe.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="tech-first">Prenom *</Label>
                    <Input id="tech-first" ref={firstRef} placeholder="ex : Jean" autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tech-last">Nom *</Label>
                    <Input id="tech-last" ref={lastRef} placeholder="ex : Tremblay" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tech-email">Courriel (facultatif)</Label>
                  <Input id="tech-email" ref={emailRef} type="email" placeholder="jean@exemple.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tech-phone">Telephone (facultatif)</Label>
                  <Input id="tech-phone" ref={phoneRef} type="tel" placeholder="819 555-0000" />
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
                  {pending ? "Creation..." : "Ajouter"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isAdmin && (
        <p className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          Acces en lecture seule. Un administrateur peut ajouter ou modifier des techniciens.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Liste des techniciens</CardTitle>
          <CardDescription>
            {technicians.length} technicien{technicians.length > 1 ? "s" : ""} —
            les inactifs peuvent etre reactivies a tout moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {editError && (
            <p className="text-destructive px-4 pb-2 text-sm" role="alert">{editError}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Actif</TableHead>
                <TableHead>Prenom</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Courriel</TableHead>
                <TableHead>Telephone</TableHead>
                {isAdmin && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 6 : 5}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    Aucun technicien. Clique sur <strong>Nouveau technicien</strong> pour commencer.
                  </TableCell>
                </TableRow>
              )}
              {technicians.map((t) => {
                const isEditing = editState?.id === t.id;
                return (
                  <TableRow key={t.id} className={t.active ? "" : "opacity-55"}>
                    {/* Actif */}
                    <TableCell>
                      <Checkbox
                        checked={t.active}
                        disabled={!isAdmin || pending}
                        onCheckedChange={(v) => toggleActive(t, v === true)}
                        aria-label={`${t.first_name} ${t.last_name} actif`}
                      />
                    </TableCell>

                    {/* Prenom */}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editState.first_name}
                          onChange={(e) =>
                            setEditState((s) => s && { ...s, first_name: e.target.value })
                          }
                          className="h-7 text-sm"
                        />
                      ) : (
                        t.first_name
                      )}
                    </TableCell>

                    {/* Nom */}
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input
                          value={editState.last_name}
                          onChange={(e) =>
                            setEditState((s) => s && { ...s, last_name: e.target.value })
                          }
                          className="h-7 text-sm"
                        />
                      ) : (
                        t.last_name
                      )}
                    </TableCell>

                    {/* Courriel */}
                    <TableCell className="text-muted-foreground text-sm">
                      {isEditing ? (
                        <Input
                          type="email"
                          value={editState.email}
                          onChange={(e) =>
                            setEditState((s) => s && { ...s, email: e.target.value })
                          }
                          className="h-7 text-sm"
                          placeholder="facultatif"
                        />
                      ) : (
                        t.email ?? "—"
                      )}
                    </TableCell>

                    {/* Telephone */}
                    <TableCell className="text-muted-foreground text-sm">
                      {isEditing ? (
                        <Input
                          type="tel"
                          value={editState.phone}
                          onChange={(e) =>
                            setEditState((s) => s && { ...s, phone: e.target.value })
                          }
                          className="h-7 text-sm"
                          placeholder="facultatif"
                        />
                      ) : (
                        t.phone ?? "—"
                      )}
                    </TableCell>

                    {/* Actions */}
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={handleSaveEdit}
                                aria-label="Enregistrer"
                                className="text-primary hover:text-primary"
                              >
                                <Check className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={() => setEditState(null)}
                                aria-label="Annuler"
                              >
                                <X className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={() => startEdit(t)}
                                aria-label={`Modifier ${t.first_name}`}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={() => { setDeleteError(null); setDeleteTarget(t); }}
                                aria-label={`Supprimer ${t.first_name}`}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog suppression */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <div className="space-y-1">
                <DialogTitle>
                  Supprimer {deleteTarget?.first_name} {deleteTarget?.last_name} ?
                </DialogTitle>
                <DialogDescription>
                  Le technicien sera retire de toutes les equipes auxquelles il est assigne.
                  Cette action est irreversible.
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
