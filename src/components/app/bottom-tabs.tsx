"use client";

import { usePathname } from "next/navigation";
import { CalendarDays, PenLine, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabLink } from "./nav";

// 하단 탭 (APP-01). 나중에 통계·랭킹 탭은 MY 앞에 넣는다
export const TABS = [
  { href: "/", label: "수업", icon: CalendarDays },
  { href: "/study", label: "공부", icon: PenLine },
  { href: "/my", label: "MY", icon: User },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <TabLink
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "fill-primary/15")} strokeWidth={active ? 2.5 : 2} />
              <span className={cn("text-[11px]", active ? "font-bold" : "font-medium")}>{label}</span>
            </TabLink>
          );
        })}
      </div>
    </nav>
  );
}
