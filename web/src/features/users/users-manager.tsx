"use client";

import { useMemo, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { KeyRound, Pencil, Plus, Search, Trash2, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createUser,
  deleteUser,
  resetUserPassword,
  updateUserRole,
  type AdminUserRow,
} from "@/actions/admin-users";

const ROLE_LABELS: Record<string, string> = {
  admin:       "Administrateur",
  secretary:   "Secrétaire",
  salesperson: "Vendeur",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  admin:       "default",
  secretary:   "secondary",
  salesperson: "outline",
};

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  secretary: 1,
  salesperson: 2,
};

function compareUsers(a: AdminUserRow, b: AdminUserRow): number {
  const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
  if (roleDiff !== 0) return roleDiff;
  return (a.full_name ?? a.email ?? "").localeCompare(
    b.full_name ?? b.email ?? "",
    "fr",
  );
}

function sortUsers(users: AdminUserRow[]): AdminUserRow[] {
  return [...users].sort(compareUsers);
}

const inp = "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const lbl = "block text-sm font-medium mb-1";

// ── Dialogue création utilisateur ─────────────────────────────────────────────

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    confirm: "",
    role: "secretary" as "admin" | "secretary" | "salesperson",
  });

  const handleSubmit = () => {
    if (!form.email.trim() || !form.full_name.trim()) return;
    if (form.password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createUser({
        email: form.email,
        full_name: form.full_name,
        password: form.password,
        role: form.role,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onClose();
    });
  };

  const canSubmit =
    !!form.email.trim() &&
    !!form.full_name.trim() &&
    form.password.length >= 8 &&
    form.password === form.confirm;

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Créer un utilisateur</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Le compte est créé tout de suite (courriel confirmé). Communique le mot de passe temporaire à la personne.
        </p>
        <div>
          <label className={lbl}>Nom complet <span className="text-destructive">*</span></label>
          <input
            className={inp}
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            placeholder="Jean Dupont"
          />
        </div>
        <div>
          <label className={lbl}>Adresse courriel <span className="text-destructive">*</span></label>
          <input
            className={inp}
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="jean@example.com"
          />
        </div>
        <div>
          <label className={lbl}>Mot de passe temporaire <span className="text-destructive">*</span></label>
          <input
            className={inp}
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Min. 8 caractères"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={lbl}>Confirmer le mot de passe <span className="text-destructive">*</span></label>
          <input
            className={inp}
            type="password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            placeholder="Répéter le mot de passe"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={lbl}>Rôle</label>
          <select
            className={inp}
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}
          >
            <option value="secretary">Secrétaire</option>
            <option value="salesperson">Vendeur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button
          onClick={handleSubmit}
          disabled={pending || !canSubmit}
          className="gap-1.5"
        >
          <UserPlus className="size-4" />
          {pending ? "Création…" : "Créer le compte"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Dialogue reset mot de passe ───────────────────────────────────────────────

function ResetPasswordDialog({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = () => {
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    if (password.length < 8) { setError("Minimum 8 caractères"); return; }
    setError(null);
    start(async () => {
      const res = await resetUserPassword(user.id, password);
      if (!res.ok) { setError(res.message); return; }
      setDone(true);
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
      </DialogHeader>
      {done ? (
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Le mot de passe de <strong>{user.full_name ?? user.email}</strong> a été modifié avec succès.
          </p>
        </div>
      ) : (
        <form
          className="space-y-4 py-2"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Utilisateur : <strong>{user.full_name ?? user.email}</strong>
          </p>
          {/* Champ leurre : empêche Chrome/Edge d’injecter le courriel du compte sauvegardé dans le MDP */}
          <input
            type="text"
            name="username"
            value={user.email ?? ""}
            readOnly
            tabIndex={-1}
            autoComplete="username"
            aria-hidden
            className="sr-only"
          />
          <div>
            <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
            <Input
              id="new-pwd"
              name="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 caractères"
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirm-pwd">Confirmer</Label>
            <Input
              id="confirm-pwd"
              name="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Répéter le mot de passe"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </form>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{done ? "Fermer" : "Annuler"}</Button>
        {!done && (
          <Button onClick={handleSubmit} disabled={pending || !password || !confirm}>
            {pending ? "Sauvegarde…" : "Modifier le mot de passe"}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

// ── Ligne utilisateur ─────────────────────────────────────────────────────────

function UserRow({ user }: { user: AdminUserRow }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [editRole, setEditRole] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleRoleChange = (role: string) => {
    setError(null);
    start(async () => {
      const res = await updateUserRole(user.id, role as "admin" | "secretary" | "salesperson");
      if (!res.ok) { setError(res.message); return; }
      setEditRole(false);
    });
  };

  const handleDelete = () => {
    if (!confirm(`Supprimer le compte de « ${user.full_name ?? user.email} » ? Cette action est irréversible.`)) return;
    start(async () => {
      const res = await deleteUser(user.id);
      if (!res.ok) setError(res.message);
    });
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-background hover:bg-muted/10 transition-colors">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{user.full_name ?? "—"}</span>
            {editRole ? (
              <select
                className="text-xs border rounded px-1.5 py-0.5 bg-background"
                defaultValue={user.role}
                autoFocus
                onBlur={() => setEditRole(false)}
                onChange={(e) => handleRoleChange(e.target.value)}
              >
                <option value="secretary">Secrétaire</option>
                <option value="salesperson">Vendeur</option>
                <option value="admin">Administrateur</option>
              </select>
            ) : (
              <Badge
                variant={ROLE_VARIANTS[user.role] ?? "secondary"}
                className="text-[11px] cursor-pointer hover:opacity-80"
                onClick={() => setEditRole(true)}
                title="Cliquer pour modifier le rôle"
              >
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex gap-3">
            <span>{user.email ?? "—"}</span>
            <span>Créé le {format(parseISO(user.created_at), "d MMM yyyy", { locale: fr })}</span>
          </div>
          {error && <p className="text-destructive text-xs mt-0.5">{error}</p>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setResetOpen(true)}
            disabled={pending}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Réinitialiser le mot de passe"
          >
            <KeyRound className="size-4" />
          </button>
          <button
            onClick={() => setEditRole(true)}
            disabled={pending}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Modifier le rôle"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Supprimer"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <Dialog open={resetOpen} onOpenChange={(o) => { if (!o) setResetOpen(false); }}>
        {resetOpen && <ResetPasswordDialog user={user} onClose={() => setResetOpen(false)} />}
      </Dialog>
    </>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export function UsersManager({ users }: { users: AdminUserRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredUsers = useMemo(() => {
    const sorted = sortUsers(users);
    const q = search.trim().toLowerCase();
    if (!q) return sorted;

    return sorted.filter((u) => {
      const haystack = [
        u.full_name,
        u.email,
        ROLE_LABELS[u.role],
        u.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Rechercher par nom, courriel ou rôle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-[38px] shrink-0 gap-1.5">
          <Plus className="size-4" />
          Créer un utilisateur
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {filteredUsers.length === users.length
          ? `${users.length} utilisateur${users.length !== 1 ? "s" : ""}`
          : `${filteredUsers.length} sur ${users.length} utilisateur${users.length !== 1 ? "s" : ""}`}
      </p>

      {users.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Aucun utilisateur</p>
        </div>
      )}

      {users.length > 0 && filteredUsers.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <p className="font-medium">Aucun résultat</p>
          <p className="mt-1 text-sm">Essayez un autre nom, courriel ou rôle.</p>
        </div>
      )}

      {filteredUsers.map((u) => (
        <UserRow key={u.id} user={u} />
      ))}

      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        {createOpen && <CreateUserDialog onClose={() => setCreateOpen(false)} />}
      </Dialog>
    </div>
  );
}
