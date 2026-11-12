import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";

// 웹앱 첫 화면. 선생님·학생 공용. 어드민은 /admin으로 따로 들어간다
export default async function Home() {
  const account = await requireUser();
  const isTeacher = account.claims.role === "teacher";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="font-semibold">Tutoring</span>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <Link href="/change-password" className="hover:text-foreground">
            비밀번호 변경
          </Link>
          <form action={logoutAction.bind(null, "app")}>
            <button type="submit" className="hover:text-foreground">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <div>
          <h1 className="text-xl font-semibold">
            {account.name}
            {isTeacher ? " 선생님" : "님"}, 반가워요
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isTeacher ? "수업 일정과 공부 기록은 곧 열려요." : "수업 예약과 공부 기록은 곧 열려요."}
          </p>
        </div>
      </section>
    </main>
  );
}
