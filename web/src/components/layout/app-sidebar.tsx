"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, MapPinned, Printer, Settings2, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/dispatch", label: "Calendrier", icon: CalendarDays },
  { href: "/nouveau", label: "Nouveau client / job", icon: ClipboardList },
  { href: "/equipes", label: "Équipes", icon: Users },
  { href: "/parametres", label: "Paramètres", icon: Settings2 },
  { href: "/impression", label: "Impression", icon: Printer },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <MapPinned className="size-5 text-sidebar-primary" aria-hidden />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Dispatch</p>
          <p className="text-muted-foreground text-xs">Terrain</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {links.map(({ href, label, icon: Icon }) => {
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
      </nav>
    </aside>
  );
}
