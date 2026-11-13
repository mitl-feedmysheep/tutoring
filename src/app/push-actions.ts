"use server";

import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { isPushSubscribed, removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/push/push";
import { ScheduleError } from "@/lib/schedule/teacher";
import type { ActionResult } from "./lesson-actions";

// 웹앱 알림 설정 액션 (APP-12, APP-18). 주인은 서버 세션에서만 정하고, 클라이언트는 이 기기의 구독 값만 보낸다

async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function savePushAction(subscription: unknown) {
  const { claims } = await requireUser();
  const userAgent = (await headers()).get("user-agent");
  return run(async () => {
    await savePushSubscription(claims, subscription, userAgent);
    return {};
  });
}

export async function removePushAction(endpoint: string) {
  const { claims } = await requireUser();
  return run(async () => {
    await removePushSubscription(claims, endpoint);
    return {};
  });
}

export async function pushStatusAction(endpoint: string) {
  const { claims } = await requireUser();
  return run(async () => ({ subscribed: await isPushSubscribed(claims, endpoint) }));
}

export async function testPushAction(endpoint: string) {
  const { claims } = await requireUser();
  return run(async () => ({ sent: await sendTestPush(claims, endpoint) }));
}
