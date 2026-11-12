import Link from "next/link";
import { requireStudent } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";

// 학생 첫 화면. 로그인 안 했으면 /login, 선생님이면 /admin으로 간다 (requireStudent)
export default async function StudentHome() {
  const { account } = await requireStudent();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="font-semibold">Tutoring</span>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <Link href="/change-password" className="hover:text-foreground">
            비밀번호 변경
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="hover:text-foreground">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-xl font-semibold">{account.name}님, 반가워요</h1>
        <p className="mt-2 text-sm text-muted-foreground">수업 예약과 공부 기록은 곧 열려요.</p>
      </section>
    </main>
  );
}
