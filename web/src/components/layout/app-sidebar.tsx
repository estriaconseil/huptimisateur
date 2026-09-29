"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  FolderOpen,
  HardHat,
  ListTodo,
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  Settings2,
  Users,
  FileText,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UserRole } from "@/types/domain";

type NavItem = { href: string; label: string; icon: React.ElementType };
type SectionId = "ventes" | "installations" | "clients" | "equipes" | "systeme" | "admin";

const OPEN_SECTIONS_KEY = "huppe.sidebar.openSections";
const COLLAPSED_KEY = "huppe.sidebar.collapsed";

const installationItems: NavItem[] = [
  { href: "/a-planifier", label: "Pipeline installation", icon: ListTodo },
  { href: "/dispatch",    label: "Calendrier installations", icon: CalendarDays },
  { href: "/nouveau",     label: "Nouveau client / job", icon: Plus },
];

const clientItems: NavItem[] = [
  { href: "/clients", label: "Base donnée clients", icon: FolderOpen },
];

const salesItems: NavItem[] = [
  { href: "/ventes/pipeline",     label: "Pipeline prospects", icon: ListTodo },
  { href: "/ventes",              label: "Calendrier ventes",  icon: CalendarDays },
  { href: "/ventes/soumissions",  label: "Soumissions",        icon: FileText },
];

const teamItems: NavItem[] = [
  { href: "/equipes",     label: "Équipes",              icon: Users },
  { href: "/techniciens", label: "Techniciens",          icon: HardHat },
  { href: "/vendeurs",    label: "Vendeurs",             icon: UserPlus },
];

const systemItems: NavItem[] = [
  { href: "/parametres",   label: "Paramètres",  icon: Settings2 },
  { href: "/interruption", label: "Interruption", icon: ShieldAlert },
  { href: "/impression",   label: "Impression",  icon: Printer },
];

const adminItems: NavItem[] = [
  { href: "/utilisateurs", label: "Utilisateurs", icon: ShieldCheck },
];

const COLLAPSED_LABELS: Record<SectionId, string> = {
  ventes: "Vente",
  installations: "Install",
  clients: "Client",
  equipes: "Équipe",
  systeme: "Système",
  admin: "Admin",
};

function sectionContainsPath(items: NavItem[], pathname: string): boolean {
  return items.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`)
  );
}

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/ventes") {
    return pathname === "/ventes" || pathname.startsWith("/ventes/rdv") || pathname.startsWith("/ventes/soumission/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function defaultOpenSections(isSalesperson: boolean, isAdmin: boolean): SectionId[] {
  if (isSalesperson) return ["ventes"];
  const ids: SectionId[] = ["ventes", "installations", "clients", "equipes", "systeme"];
  if (isAdmin) ids.push("admin");
  return ids;
}

function readOpenSections(fallback: SectionId[]): Set<SectionId> {
  try {
    const raw = localStorage.getItem(OPEN_SECTIONS_KEY);
    if (!raw) return new Set(fallback);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(fallback);
    return new Set(parsed.filter((id): id is SectionId => typeof id === "string"));
  } catch {
    return new Set(fallback);
  }
}

function readCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === "1";
}

function NavLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const { href, label, icon: Icon } = item;
  const active = isItemActive(href, pathname);
  const link = (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0 py-2" : "gap-2 px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
      )}
    >
      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function NavGroup({
  id,
  title,
  items,
  pathname,
  open,
  collapsed,
  onToggle,
}: {
  id: SectionId;
  title: string;
  items: NavItem[];
  pathname: string;
  open: boolean;
  collapsed: boolean;
  onToggle: (id: SectionId) => void;
}) {
  if (collapsed) {
    return (
      <div className="mt-1.5 first:mt-0">
        <p className="mb-0.5 px-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40 leading-tight">
          {COLLAPSED_LABELS[id]}
        </p>
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} collapsed />
          ))}
        </div>
      </div>
    );
  }

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
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} collapsed={false} />
          ))}
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
  return isSalesperson ? "ventes" : "installations";
}

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const isSalesperson = role === "salesperson";
  const isAdmin = role === "admin";
  const defaults = defaultOpenSections(isSalesperson, isAdmin);

  const [openSections, setOpenSections] = useState<Set<SectionId>>(() => new Set(defaults));
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpenSections(readOpenSections(defaults));
    setCollapsed(readCollapsed());
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...openSections]));
  }, [openSections, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  // Ouvre la section de la page courante sans fermer les autres
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
    <TooltipProvider delay={200}>
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground flex shrink-0 flex-col border-r border-sidebar-border print:hidden transition-[width] duration-200",
          collapsed ? "w-14" : "w-56"
        )}
      >
        <div className={cn(
          "flex h-14 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-1" : "gap-2 px-3"
        )}>
          {!collapsed && (
            <>
              <div className="relative size-8 shrink-0 overflow-hidden rounded">
                <Image
                  src="/icons/icon-192.png"
                  alt="Logo Huppé Réfrigération"
                  fill
                  sizes="32px"
                  className="object-contain"
                  priority
                />
              </div>
              <div className="leading-tight min-w-0 flex-1">
                <p className="text-sm font-bold tracking-wide text-sidebar-foreground truncate">Huptimisateur</p>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
            aria-label={collapsed ? "Agrandir le menu" : "Réduire le menu"}
            title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden p-2">
          <NavGroup
            id="ventes"
            title="Ventes"
            items={salesItems}
            pathname={pathname}
            open={openSections.has("ventes")}
            collapsed={collapsed}
            onToggle={toggle}
          />

          {!isSalesperson && (
            <NavGroup
              id="installations"
              title="Installations"
              items={installationItems}
              pathname={pathname}
              open={openSections.has("installations")}
              collapsed={collapsed}
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
              collapsed={collapsed}
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
              collapsed={collapsed}
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
              collapsed={collapsed}
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
              collapsed={collapsed}
              onToggle={toggle}
            />
          )}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
