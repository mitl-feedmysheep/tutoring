"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 어드민 화면 위쪽 탭. 탭마다 주소가 달라서 새로고침·뒤로 가기에도 같은 탭이 열린다
export function PageTabs({ tabs }: { tabs: { name: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-6 border-b">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors",
              active ? "border-indigo-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
