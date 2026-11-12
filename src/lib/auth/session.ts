import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { teacherDb, studentDb } from "@/lib/db/scope";
import { loadAccount, type Account } from "./login";
import { SESSION_DAYS, signSession, verifySession, type SessionClaims } from "./token";

// 인투디헤븐과 상위 도메인이 같으므로 이름을 따로 쓰고 Domain 속성 없이 이 서브도메인 전용으로 둔다
const COOKIE = "tutoring_session";

export async function setSessionCookie(claims: SessionClaims) {
  const store = await cookies();
  store.set(COOKIE, await signSession(claims), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** 지금 로그인한 계정. 토큰 서명과 DB 상태(비밀번호 변경·비활성화)를 모두 확인한다. 요청마다 한 번만 조회 */
export const getAccount = cache(async (): Promise<Account | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  return claims ? loadAccount(claims) : null;
});

/** 로그인 + 비밀번호 변경이 끝난 계정만 통과. 아니면 해당 화면으로 보낸다 */
async function requireReady(): Promise<Account> {
  const account = await getAccount();
  if (!account) redirect("/login");
  if (account.mustChangePassword) redirect("/change-password");
  return account;
}

/** 선생님 화면·액션에서 쓴다. teacherId는 여기(서버 세션)에서만 나온다 */
export async function requireTeacher() {
  const account = await requireReady();
  if (account.claims.role !== "teacher") redirect("/");
  const { teacherId } = account.claims;
  return { account, teacherId, db: teacherDb(teacherId) };
}

/** 학생 화면·액션에서 쓴다 */
export async function requireStudent() {
  const account = await requireReady();
  if (account.claims.role !== "student") redirect("/admin");
  const { teacherId, studentId } = account.claims;
  return { account, teacherId, studentId, db: studentDb(teacherId, studentId) };
}

/** 로그인한 사람의 첫 화면 */
export function homePath(account: Account) {
  if (account.mustChangePassword) return "/change-password";
  return account.claims.role === "teacher" ? "/admin" : "/";
}
