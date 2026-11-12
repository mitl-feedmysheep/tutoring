import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getAccount, homePath } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage() {
  const account = await getAccount();
  if (account) redirect(homePath(account));
  return (
    <AuthCard title="로그인" description="이메일과 비밀번호로 로그인해 주세요.">
      <LoginForm />
      <p className="mt-6 text-center text-xs text-muted-foreground">비밀번호를 잊었으면 선생님께 초기화를 요청해 주세요.</p>
    </AuthCard>
  );
}
