import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SubScreen } from "@/components/app/screens";
import { LoginForm } from "@/components/auth/login-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { logoutAction } from "@/app/auth-actions";
import { AREA_PATHS, getAccount, homePath, type Area } from "@/lib/auth/session";

// 웹앱(/login)과 어드민(/admin/login)이 같이 쓰는 화면

export async function LoginScreen({ area }: { area: Area }) {
  const account = await getAccount(area);
  if (account) redirect(homePath(account, area));
  return (
    <AuthCard
      title={area === "admin" ? "선생님 어드민" : "로그인"}
      description={area === "admin" ? "선생님 계정으로 로그인해 주세요." : "이메일과 비밀번호로 로그인해 주세요."}
    >
      <LoginForm area={area} />
      {area === "app" && <p className="mt-6 text-center text-xs text-muted-foreground">비밀번호를 잊었으면 선생님께 초기화를 요청해 주세요.</p>}
    </AuthCard>
  );
}

/** AUTH-08: 초기화된 계정은 여기서 바꾸기 전까지 다른 화면으로 못 간다 (session.ts의 requireUser) */
export async function ChangePasswordScreen({ area }: { area: Area }) {
  const account = await getAccount(area);
  if (!account) redirect(AREA_PATHS[area].login);
  const forced = account.mustChangePassword;
  // 웹앱에서 스스로 바꿀 때는 MY 탭의 하위 화면 (← 로 돌아간다)
  if (area === "app" && !forced) {
    return (
      <SubScreen title="비밀번호 변경" fallback="/my">
        <div className="rounded-xl bg-card p-4 shadow-[0_0_0_1px_var(--color-border)]">
          <ChangePasswordForm area={area} needsCurrent />
        </div>
      </SubScreen>
    );
  }
  return (
    <AuthCard
      title={forced ? "새 비밀번호 설정" : "비밀번호 변경"}
      description={forced ? "임시 비밀번호로 로그인했어요. 계속하려면 새 비밀번호를 정해 주세요." : undefined}
    >
      <ChangePasswordForm area={area} needsCurrent={!forced} />
      <div className="mt-4 text-center text-xs text-muted-foreground">
        {forced ? (
          <form action={logoutAction.bind(null, area)}>
            <button type="submit" className="underline-offset-4 hover:underline">
              로그아웃
            </button>
          </form>
        ) : (
          <Link href={AREA_PATHS[area].home} className="underline-offset-4 hover:underline">
            돌아가기
          </Link>
        )}
      </div>
    </AuthCard>
  );
}
