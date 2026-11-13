import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth/session";
import { authUrl } from "@/lib/meeting/google";
import { googleMeetConfigured } from "@/lib/meeting/meeting";
import { originOf, redirectUriOf, STATE_COOKIE } from "../oauth";

// 어드민 "구글 계정 연결" (MEET-01): 구글 동의 화면으로 보낸다. 돌아올 때 state 쿠키로 같은 브라우저인지 확인한다
export async function GET(req: NextRequest) {
  await requireTeacher();
  const origin = originOf(req);
  if (!origin || !googleMeetConfigured()) return NextResponse.redirect(new URL("/admin/meeting?google=config", req.url));

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(redirectUriOf(origin), state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/google",
    maxAge: 10 * 60,
  });
  return res;
}
