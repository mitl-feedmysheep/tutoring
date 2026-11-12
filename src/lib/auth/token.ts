import { SignJWT, jwtVerify } from "jose";

// 로그인 쿠키에 넣는 서명 토큰. 서명만 확인하고, 계정 상태(비밀번호 변경·비활성화)는 session.ts가 DB로 확인한다

export const SESSION_DAYS = 90;

/** 웹앱과 어드민은 로그인 상태가 따로다. 토큰에 어느 쪽 것인지 넣어서 서로 바꿔 쓸 수 없게 한다 */
export type Area = "app" | "admin";

export type SessionClaims =
  | { role: "teacher"; teacherId: string; v: number }
  | { role: "student"; teacherId: string; studentId: string; v: number };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET이 없거나 32자보다 짧습니다");
  return new TextEncoder().encode(value);
}

export function signSession(claims: SessionClaims, area: Area): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(area)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string, area: Area): Promise<SessionClaims | null> {
  try {
    const { payload: p } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: area });
    if (typeof p.teacherId !== "string" || typeof p.v !== "number") return null;
    if (p.role === "teacher") return { role: "teacher", teacherId: p.teacherId, v: p.v };
    if (p.role === "student" && typeof p.studentId === "string") {
      return { role: "student", teacherId: p.teacherId, studentId: p.studentId, v: p.v };
    }
    return null;
  } catch {
    return null;
  }
}
