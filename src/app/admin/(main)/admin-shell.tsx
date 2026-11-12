"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

// 1024px 이상은 왼쪽 고정 사이드바, 그보다 좁으면(폰, 태블릿 세로) 왼쪽에서 열리는 서랍.
// 사이드바는 sticky가 아니라 fixed로 화면 위아래에 붙인다. 아이패드 크롬·사파리는 스크롤할 때 주소창이 줄면서
// 화면 높이가 바뀌는데, sticky + h-dvh는 이때 사이드바가 같이 올라가고 아래가 비었다
export function AdminShell({ teacherName, isAdmin, children }: { teacherName: string; isAdmin: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh bg-slate-50">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block">
        <Sidebar teacherName={teacherName} isAdmin={isAdmin} />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 gap-0 border-r-0 bg-slate-900 p-0 text-white [&>button]:text-white">
          <SheetTitle className="sr-only">메뉴</SheetTitle>
          <Sidebar teacherName={teacherName} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-white px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1 text-slate-600 hover:bg-slate-100" aria-label="메뉴 열기">
            <Menu className="size-6" />
          </button>
          <span className="text-sm font-semibold">Tutoring</span>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
