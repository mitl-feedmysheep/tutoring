"use client";

import { logoutAction } from "@/app/auth-actions";
import { removePushAction } from "@/app/push-actions";
import { clearPrompted, currentSubscription } from "@/lib/app/push-client";

/** 웹앱 로그아웃. 이 기기 알림을 먼저 끈다 (APP-18): 같은 기기에서 다른 사람이 로그인해도 앞사람 알림이 오지 않게 */
export function LogoutButton() {
  async function logout() {
    clearPrompted();
    try {
      const sub = await currentSubscription();
      if (sub) {
        await removePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch {
      // 알림 끄기가 실패해도 로그아웃은 한다
    }
    await logoutAction("app");
  }

  return (
    <form action={logout} className="text-center">
      <button type="submit" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
        로그아웃
      </button>
    </form>
  );
}
