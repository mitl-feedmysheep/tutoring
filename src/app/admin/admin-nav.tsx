"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin/students", label: "학생" },
  { href: "/admin/invites", label: "초대 링크" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 text-sm">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn("text-muted-foreground hover:text-foreground", pathname.startsWith(item.href) && "font-medium text-foreground")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
