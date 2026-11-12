import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { teacherDb, studentDb } from "@/lib/db/scope";
import { loadAccount, type Account } from "./login";
import { SESSION_DAYS, signSession, verifySession, type Area, type SessionClaims } from "./token";

export type { Area };

// 웹앱과 어드민은 로그인 상태가 따로다 (쿠키도 따로).
// 인투디헤븐과 상위 도메인이 같으므로 이름을 따로 쓰고 Domain 속성 없이 이 서브도메인 전용으로 둔다
const COOKIES: Record<Area, string> = { app: "tutoring_session", admin: "tutoring_admin_session" };

export async function setSessionCookie(area: Area, claims: SessionClaims) {
  const store = await cookies();
  store.set(COOKIES[area], await signSession(claims, area), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(area: Area) {
  (await cookies()).delete(COOKIES[area]);
}

/** 그 영역(웹앱/어드민)에 로그인한 계정. 토큰 서명과 DB 상태(비밀번호 변경·비활성화)를 모두 확인한다. 요청마다 한 번만 조회 */
export const getAccount = cache(async (area: Area): Promise<Account | null> => {
  const token = (await cookies()).get(COOKIES[area])?.value;
  if (!token) return null;
  const claims = await verifySession(token, area);
  if (!claims) return null;
  if (area === "admin" && claims.role !== "teacher") return null;
  return loadAccount(claims);
});

/** 웹앱(/)과 어드민(/admin)의 화면 주소 */

export const AREA_PATHS = {
  app: { home: "/", login: "/login", changePassword: "/change-password" },
  admin: { home: "/admin", login: "/admin/login", changePassword: "/admin/change-password" },
} as const satisfies Record<Area, Record<string, string>>;

/** 로그인 + 비밀번호 변경이 끝난 계정만 통과. 아니면 그 영역의 로그인·변경 화면으로 보낸다 */
export async function requireUser(area: Area = "app"): Promise<Account> {
  const account = await getAccount(area);
  if (!account) redirect(AREA_PATHS[area].login);
  if (account.mustChangePassword) redirect(AREA_PATHS[area].changePassword);
  return account;
}

/** 어드민 화면·액션에서 쓴다. teacherId는 여기(서버 세션)에서만 나온다 */
export async function requireTeacher() {
  const account = await requireUser("admin");
  if (account.claims.role !== "teacher") redirect("/");
  const { teacherId } = account.claims;
  return { account, teacherId, db: teacherDb(teacherId) };
}

/** 시스템 관리자 전용 화면·액션 (ADMIN-05). 관리자가 아니면 그런 화면이 없는 것처럼 404 */
export async function requireSystemAdmin() {
  const teacher = await requireTeacher();
  if (!teacher.account.isAdmin) notFound();
  return teacher;
}

/** 웹앱의 학생 전용 화면·액션에서 쓴다 */
export async function requireStudent() {
  const account = await requireUser("app");
  if (account.claims.role !== "student") redirect("/");
  const { teacherId, studentId } = account.claims;
  return { account, teacherId, studentId, db: studentDb(teacherId, studentId) };
}

/** 로그인한 사람이 그 영역에서 처음 볼 화면 */
export function homePath(account: Account, area: Area) {
  return account.mustChangePassword ? AREA_PATHS[area].changePassword : AREA_PATHS[area].home;
}
