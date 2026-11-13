import type { NextRequest } from "next/server";
import { ALLOWED_ORIGINS, CALLBACK_PATH } from "@/lib/meeting/google";

// 구글 연결 (MEET-01) 공용. 리디렉션 주소는 요청 Host를 그대로 믿지 않고 구글에 등록한 출처 중에서만 고른다

export const STATE_COOKIE = "tutoring_google_state";

export function originOf(req: NextRequest): string | null {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

export const redirectUriOf = (origin: string) => `${origin}${CALLBACK_PATH}`;
