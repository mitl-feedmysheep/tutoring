import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { checkInvite, type InviteState } from "@/lib/auth/invite";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "가입", robots: { index: false } };

const CLOSED: Record<Exclude<InviteState, "ok">, string> = {
  invalid: "올바르지 않은 초대 링크예요.",
  expired: "초대 링크는 발급하고 1시간 동안만 쓸 수 있어요. 이 링크는 만료됐어요.",
  used: "이미 가입에 사용된 링크예요. 가입했다면 로그인해 주세요.",
  revoked: "선생님이 취소한 링크예요.",
};

// AUTH-02: 쓸 수 없는 링크는 안내 문구만 보여준다
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await checkInvite(token);

  if (invite.state !== "ok") {
    return (
      <AuthCard title="초대 링크를 쓸 수 없어요" description={CLOSED[invite.state]}>
        <p className="text-sm text-muted-foreground">선생님께 새 초대 링크를 요청해 주세요.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
          로그인 화면으로
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="가입하기" description={`${invite.teacherName} 선생님의 초대로 가입해요.`}>
      <SignupForm token={token} />
    </AuthCard>
  );
}
