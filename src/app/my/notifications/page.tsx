import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { vapidPublicKey } from "@/lib/push/push";
import { SubScreen } from "@/components/app/screens";
import { NotificationSettings } from "@/components/app/notification-settings";

export const metadata: Metadata = { title: "알림 설정" };

// MY > 알림 설정 (APP-12, APP-18). 공개 키는 빌드 때가 아니라 실행 때 Doppler 값을 읽어 넘긴다
export default async function NotificationsScreen() {
  const { claims } = await requireUser();
  return (
    <SubScreen title="알림 설정" fallback="/my">
      <NotificationSettings publicKey={vapidPublicKey()} canTest={claims.role === "teacher"} />
    </SubScreen>
  );
}
