import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import Link from "next/link";
import { getAccount, homePath } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "비밀번호 변경" };

// AUTH-08: 초기화된 계정은 여기서 바꾸기 전까지 다른 화면으로 못 간다 (session.ts의 requireTeacher/requireStudent)
export default async function ChangePasswordPage() {
  const account = await getAccount();
  if (!account) redirect("/login");
  const forced = account.mustChangePassword;
  return (
    <AuthCard
      title={forced ? "새 비밀번호 설정" : "비밀번호 변경"}
      description={forced ? "임시 비밀번호로 로그인했어요. 계속하려면 새 비밀번호를 정해 주세요." : undefined}
    >
      <ChangePasswordForm needsCurrent={!forced} />
      <div className="mt-4 text-center text-xs text-muted-foreground">
        {forced ? (
          <form action={logoutAction}>
            <button type="submit" className="underline-offset-4 hover:underline">
              로그아웃
            </button>
          </form>
        ) : (
          <Link href={homePath(account)} className="underline-offset-4 hover:underline">
            돌아가기
          </Link>
        )}
      </div>
    </AuthCard>
  );
}
