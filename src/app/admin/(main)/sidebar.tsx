"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, KeyRound, LogOut, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/auth-actions";

const NAV = [{ name: "학생 관리", href: "/admin/students", icon: Users }];

const itemClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
    active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white",
  );

export function Sidebar({ teacherName, onNavigate }: { teacherName: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-dvh w-64 flex-col bg-slate-900 text-white md:sticky md:top-0">
      <div className="border-b border-slate-800 px-6 py-4">
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2">
          <GraduationCap className="size-6 text-indigo-400" />
          <span className="text-lg font-semibold">Tutoring</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={itemClass(pathname === item.href || pathname.startsWith(item.href + "/"))}
          >
            <item.icon className="size-5" />
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="space-y-1 border-t border-slate-800 p-3">
        <p className="px-3 pb-1 text-sm text-slate-400">{teacherName} 선생님</p>
        <Link href="/admin/change-password" onClick={onNavigate} className={itemClass(false)}>
          <KeyRound className="size-5" />
          비밀번호 변경
        </Link>
        <form action={logoutAction.bind(null, "admin")}>
          <button type="submit" className={itemClass(false)}>
            <LogOut className="size-5" />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}
