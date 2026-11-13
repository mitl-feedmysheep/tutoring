import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { myTeacherName } from "@/lib/app/profile";
import { logoutAction } from "@/app/auth-actions";
import { TabScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "MY" };

// MY 탭 (APP-04). 게시판·자료실·알림 설정은 각 기능을 만들 때 연결한다. 납부 내역은 학생만 (PAY-04)
export default async function MyTab() {
  const account = await requireUser();
  const { claims } = account;
  let subtitle = "선생님";
  if (claims.role === "student") {
    subtitle = `담당 선생님 · ${(await myTeacherName(claims.teacherId, claims.studentId)) ?? ""}`;
  }

  return (
    <TabScreen title="MY">
      <section className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-[0_0_0_1px_var(--color-border)]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-primary">
          {account.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </section>

      <Menu>
        <MenuItem label="게시판" />
        <MenuItem label="자료실" />
        {claims.role === "student" && <MenuItem label="납부 내역" href="/my/payments" />}
      </Menu>
      <Menu>
        <MenuItem label="알림 설정" />
        <MenuItem label="비밀번호 변경" href="/change-password" />
      </Menu>

      <form action={logoutAction.bind(null, "app")} className="text-center">
        <button type="submit" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
          로그아웃
        </button>
      </form>
    </TabScreen>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return <section className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--color-border)]">{children}</section>;
}

/** href가 없으면 아직 준비 중인 메뉴 */
function MenuItem({ label, href }: { label: string; href?: string }) {
  const inner = (
    <>
      <span>{label}</span>
      {href ? <ChevronRight className="size-4 text-muted-foreground" /> : <span className="text-xs text-muted-foreground">준비 중</span>}
    </>
  );
  const className = "flex items-center justify-between px-4 py-3.5 text-[15px]";
  return href ? (
    <Link href={href} className={`${className} transition-colors hover:bg-accent/50`}>
      {inner}
    </Link>
  ) : (
    <div className={`${className} text-muted-foreground`}>{inner}</div>
  );
}
