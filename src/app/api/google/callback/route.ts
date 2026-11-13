import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth/session";
import { exchangeCode, GoogleError } from "@/lib/meeting/google";
import { saveGoogleConnection } from "@/lib/meeting/meeting";
import { originOf, redirectUriOf, STATE_COOKIE } from "../oauth";

function sameState(a: string | undefined, b: string | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// 구글 동의 화면에서 돌아오는 곳 (구글 OAuth 클라이언트에 등록한 주소). 로그인한 선생님에게 연결을 저장한다
export async function GET(req: NextRequest) {
  const { db, teacherId } = await requireTeacher();
  const origin = originOf(req);
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/admin/meeting?google=${result}`, origin ?? req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const q = req.nextUrl.searchParams;
  if (!origin || !sameState(req.cookies.get(STATE_COOKIE)?.value, q.get("state"))) return back("expired");
  if (q.get("error")) return back("denied"); // 선생님이 동의 화면에서 취소
  const code = q.get("code");
  if (!code) return back("failed");

  try {
    const conn = await exchangeCode(code, redirectUriOf(origin));
    await saveGoogleConnection(db, teacherId, conn);
    return back("connected");
  } catch (e) {
    console.error("[meeting] 구글 연결 실패", e);
    // 동의 화면에서 캘린더 권한 체크를 빼고 허용한 경우
    if (e instanceof GoogleError && e.status === 403) return back("scope");
    return back("failed");
  }
}
