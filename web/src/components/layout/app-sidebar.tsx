"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  HardHat,
  ListTodo,
  Printer,
  Settings2,
  Users,
  CalendarCheck,
  FileText,
  UserPlus,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/domain";

type NavItem = { href: string; label: string; icon: React.ElementType };
type SectionId = "ventes" | "installations" | "clients" | "equipes" | "systeme" | "admin";

const installationItems: NavItem[] = [
  { href: "/a-planifier", label: "Jobs à placer",        icon: ListTodo },
  { href: "/dispatch",    label: "Calendrier",          icon: CalendarDays },
  { href: "/nouveau",     label: "Nouveau client / job", icon: ClipboardList },
];

const clientItems: NavItem[] = [
  { href: "/clients", label: "Base donnée clients", icon: FolderOpen },
];

const salesItems: NavItem[] = [
  { href: "/ventes/pipeline",     label: "Pipeline prospects", icon: ListTodo },
  { href: "/ventes",              label: "Calendrier ventes",  icon: CalendarCheck },
  { href: "/ventes/soumissions",  label: "Soumissions",        icon: FileText },
];

const teamItems: NavItem[] = [
  { href: "/equipes",     label: "Équipes",              icon: Users },
  { href: "/techniciens", label: "Techniciens",          icon: HardHat },
  { href: "/vendeurs",    label: "Vendeurs",             icon: UserPlus },
];

const systemItems: NavItem[] = [
  { href: "/parametres",   label: "Paramètres",  icon: Settings2 },
  { href: "/impression",   label: "Impression",  icon: Printer },
];

const adminItems: NavItem[] = [
  { href: "/utilisateurs", label: "Utilisateurs", icon: ShieldCheck },
];

function sectionContainsPath(items: NavItem[], pathname: string): boolean {
  return items.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );
}

function NavGroup({
  id,
  title,
  items,
  pathname,
  open,
  onToggle,
}: {
  id: SectionId;
  title: string;
  items: NavItem[];
  pathname: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/80 transition-colors"
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 opacity-70 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-0.5 mt-0.5">
          {items.map(({ href, label, icon: Icon }) => {
            // Évite que /ventes active aussi /ventes/pipeline et /ventes/soumissions
            const active =
              href === "/ventes"
                ? pathname === "/ventes" || pathname.startsWith("/ventes/rdv") || pathname.startsWith("/ventes/soumission/")
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function sectionForPath(pathname: string, isSalesperson: boolean, isAdmin: boolean): SectionId {
  if (sectionContainsPath(salesItems, pathname) || pathname.startsWith("/ventes/")) {
    return "ventes";
  }
  if (!isSalesperson && sectionContainsPath(installationItems, pathname)) {
    return "installations";
  }
  if (!isSalesperson && sectionContainsPath(clientItems, pathname)) {
    return "clients";
  }
  if (!isSalesperson && sectionContainsPath(teamItems, pathname)) {
    return "equipes";
  }
  if (!isSalesperson && sectionContainsPath(systemItems, pathname)) {
    return "systeme";
  }
  if (isAdmin && sectionContainsPath(adminItems, pathname)) {
    return "admin";
  }
  // Défaut : Ventes pour vendeurs, Installations sinon
  return isSalesperson ? "ventes" : "installations";
}

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const isSalesperson = role === "salesperson";
  const isAdmin = role === "admin";

  const [openSections, setOpenSections] = useState<Set<SectionId>>(() =>
    new Set([sectionForPath(pathname, isSalesperson, isAdmin)])
  );

  // Ouvre automatiquement la section de la page courante
  useEffect(() => {
    const current = sectionForPath(pathname, isSalesperson, isAdmin);
    setOpenSections((prev) => {
      if (prev.has(current)) return prev;
      const next = new Set(prev);
      next.add(current);
      return next;
    });
  }, [pathname, isSalesperson, isAdmin]);

  const toggle = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r border-sidebar-border print:hidden">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="relative size-8 shrink-0 overflow-hidden rounded">
          <Image
            src="/logo.jpg"
            alt="Logo Huppé Réfrigération"
            fill
            sizes="32px"
            className="object-contain"
            priority
          />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-wide text-sidebar-foreground">Huptimisateur</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0 overflow-y-auto p-2">
        <NavGroup
          id="ventes"
          title="Ventes"
          items={salesItems}
          pathname={pathname}
          open={openSections.has("ventes")}
          onToggle={toggle}
        />

        {!isSalesperson && (
          <NavGroup
            id="installations"
            title="Installations"
            items={installationItems}
            pathname={pathname}
            open={openSections.has("installations")}
            onToggle={toggle}
          />
        )}

        {!isSalesperson && (
          <NavGroup
            id="clients"
            title="Clients"
            items={clientItems}
            pathname={pathname}
            open={openSections.has("clients")}
            onToggle={toggle}
          />
        )}

        {!isSalesperson && (
          <NavGroup
            id="equipes"
            title="Équipes"
            items={teamItems}
            pathname={pathname}
            open={openSections.has("equipes")}
            onToggle={toggle}
          />
        )}

        {!isSalesperson && (
          <NavGroup
            id="systeme"
            title="Système"
            items={systemItems}
            pathname={pathname}
            open={openSections.has("systeme")}
            onToggle={toggle}
          />
        )}

        {isAdmin && (
          <NavGroup
            id="admin"
            title="Admin"
            items={adminItems}
            pathname={pathname}
            open={openSections.has("admin")}
            onToggle={toggle}
          />
        )}
      </nav>
    </aside>
  );
}
