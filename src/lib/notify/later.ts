import { after } from "next/server";

// 이벤트 알림은 응답을 보낸 뒤 보낸다: 사용자가 푸시 발송을 기다리지 않고, 알림이 실패해도 동작은 그대로 성공한다

export function notifyLater(label: string, fn: () => Promise<unknown>) {
  after(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[notify] ${label} 실패`, e);
    }
  });
}
