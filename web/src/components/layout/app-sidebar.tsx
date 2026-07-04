"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
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

const installationItems: NavItem[] = [
  { href: "/dispatch",    label: "Calendrier",          icon: CalendarDays },
  { href: "/a-planifier", label: "Jobs à placer",        icon: ListTodo },
  { href: "/nouveau",     label: "Nouveau client / job", icon: ClipboardList },
  { href: "/clients",     label: "Clients & Jobs",       icon: FolderOpen },
];

const salesItems: NavItem[] = [
  { href: "/ventes",              label: "Calendrier ventes",  icon: CalendarCheck },
  { href: "/ventes/pipeline",     label: "Pipeline prospects", icon: ListTodo },
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

function NavGroup({
  title,
  items,
  pathname,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="space-y-0.5 mt-4 first:mt-0">
      {title && (
        <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
          {title}
        </p>
      )}
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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
  );
}

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const isSalesperson = role === "salesperson";
  const isAdmin = role === "admin";

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r border-sidebar-border">
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
        {/* Ventes — visible par tous */}
        <NavGroup title="Ventes" items={salesItems} pathname={pathname} />

        {/* Installations — cachées pour les vendeurs */}
        {!isSalesperson && (
          <NavGroup title="Installations" items={installationItems} pathname={pathname} />
        )}

        {/* Équipes — cachées pour les vendeurs */}
        {!isSalesperson && (
          <NavGroup title="Équipes" items={teamItems} pathname={pathname} />
        )}

        {/* Système — admin et secrétaires uniquement */}
        {!isSalesperson && (
          <NavGroup title="Système" items={systemItems} pathname={pathname} />
        )}

        {/* Admin uniquement */}
        {isAdmin && (
          <NavGroup title="Admin" items={adminItems} pathname={pathname} />
        )}
      </nav>
    </aside>
  );
}
