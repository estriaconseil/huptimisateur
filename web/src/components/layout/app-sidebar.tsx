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
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ElementType };

const groups: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dispatch",    label: "Calendrier",          icon: CalendarDays },
      { href: "/a-planifier", label: "Jobs à placer",        icon: ListTodo },
      { href: "/nouveau",     label: "Nouveau client / job", icon: ClipboardList },
      { href: "/clients",     label: "Clients & Jobs",       icon: FolderOpen },
    ],
  },
  {
    title: "Équipes",
    items: [
      { href: "/equipes",     label: "Équipes",              icon: Users },
      { href: "/techniciens", label: "Techniciens",          icon: HardHat },
    ],
  },
  {
    title: "Système",
    items: [
      { href: "/parametres",  label: "Paramètres",           icon: Settings2 },
      { href: "/impression",  label: "Impression",           icon: Printer },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

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
        {groups.map((group, gi) => (
          <div key={gi} className={cn("space-y-0.5", gi > 0 && "mt-4")}>
            {group.title && (
              <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                {group.title}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon }) => {
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
        ))}
      </nav>
    </aside>
  );
}
