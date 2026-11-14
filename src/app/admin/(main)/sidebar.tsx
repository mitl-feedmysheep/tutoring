"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, GraduationCap, KeyRound, LogOut, School, Users, Video, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/auth-actions";

const NAV = [
  { name: "일정", href: "/admin/schedule", icon: CalendarDays },
  { name: "학생 관리", href: "/admin/students", icon: Users },
  { name: "과외비", href: "/admin/payments", icon: Wallet },
  { name: "자료실", href: "/admin/files", icon: FileText },
  { name: "화상 수업", href: "/admin/meeting", icon: Video },
];
// 시스템 관리자에게만 보인다. 화면과 액션에서도 따로 막는다
const ADMIN_NAV = [{ name: "선생님 관리", href: "/admin/teachers", icon: School }];

const itemClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
    active ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white",
  );

export function Sidebar({ teacherName, isAdmin, onNavigate }: { teacherName: string; isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-64 flex-col overflow-y-auto bg-slate-900 text-white">
      <div className="border-b border-slate-800 px-6 py-4">
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2">
          <GraduationCap className="size-6 text-emerald-400" />
          <span className="text-lg font-semibold">Tutoring</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col px-3 py-4">
        <div className="space-y-1">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
        {/* 관리자 전용은 아래로 떼어 놓아 선생님 기능과 헷갈리지 않게 한다 */}
        {isAdmin && (
          <div className="mt-auto space-y-1 border-t border-slate-800 pt-4">
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500">관리자 전용</p>
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </div>
        )}
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

function NavLink({ item, pathname, onNavigate }: { item: (typeof NAV)[number]; pathname: string; onNavigate?: () => void }) {
  return (
    <Link href={item.href} onClick={onNavigate} className={itemClass(pathname === item.href || pathname.startsWith(item.href + "/"))}>
      <item.icon className="size-5" />
      {item.name}
    </Link>
  );
}
