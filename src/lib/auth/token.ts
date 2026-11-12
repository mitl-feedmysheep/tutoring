import { SignJWT, jwtVerify } from "jose";

// 로그인 쿠키에 넣는 서명 토큰. 서명만 확인하고, 계정 상태(비밀번호 변경·비활성화)는 session.ts가 DB로 확인한다

export const SESSION_DAYS = 90;

export type SessionClaims =
  | { role: "teacher"; teacherId: string; v: number }
  | { role: "student"; teacherId: string; studentId: string; v: number };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET이 없거나 32자보다 짧습니다");
  return new TextEncoder().encode(value);
}

export function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload: p } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
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
