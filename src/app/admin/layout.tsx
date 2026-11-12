import Link from "next/link";
import { requireTeacher } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { AdminNav } from "./admin-nav";

// 레이아웃은 화면 이동 때 다시 그려지지 않으므로, 페이지·액션마다 requireTeacher를 따로 부른다
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account } = await requireTeacher();
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/admin" className="font-semibold">
            Tutoring
          </Link>
          <AdminNav />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{account.name} 선생님</span>
            <Link href="/change-password" className="text-muted-foreground hover:text-foreground">
              비밀번호 변경
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-muted-foreground hover:text-foreground">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
