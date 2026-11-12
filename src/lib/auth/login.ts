import { prisma } from "@/lib/db/client";
import { normalizeEmail } from "./accounts";
import { hashPassword, validatePassword, verifyPassword } from "./password";
import type { SessionClaims } from "./token";

// 로그인과 계정 상태 확인. 아직 선생님 범위를 모르는 단계라 원본 클라이언트를 쓴다

export type Account = {
  claims: SessionClaims;
  name: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const LOGIN_FAILED = "이메일 또는 비밀번호가 올바르지 않습니다";

// 없는 이메일도 bcrypt 비교를 한 번 해서 응답 시간으로 계정 유무를 알 수 없게 한다
let dummyHash: Promise<string> | undefined;

export async function authenticate(rawEmail: string, password: string): Promise<Account> {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) throw new AuthError("이메일과 비밀번호를 입력해 주세요");

  const account = await findByEmail(email);
  const hash = account?.passwordHash ?? (await (dummyHash ??= hashPassword("not-a-real-password")));
  const ok = await verifyPassword(password, hash);
  if (!account || !ok) throw new AuthError(LOGIN_FAILED);
  return account.toAccount();
}

async function findByEmail(email: string) {
  const teacher = await prisma.teacher.findFirst({ where: { email, deletedAt: null } });
  if (teacher) {
    return {
      passwordHash: teacher.passwordHash,
      toAccount: (): Account => ({
        claims: { role: "teacher", teacherId: teacher.id, v: teacher.sessionVersion },
        name: teacher.name,
        isAdmin: teacher.isAdmin,
        mustChangePassword: teacher.mustChangePassword,
      }),
    };
  }
  const student = await prisma.student.findFirst({
    where: { email, deletedAt: null, deactivatedAt: null, teacher: { deletedAt: null } },
  });
  if (student) {
    return {
      passwordHash: student.passwordHash,
      toAccount: (): Account => ({
        claims: { role: "student", teacherId: student.teacherId, studentId: student.id, v: student.sessionVersion },
        name: student.name,
        isAdmin: false,
        mustChangePassword: student.mustChangePassword,
      }),
    };
  }
  return null;
}

/**
 * 쿠키의 토큰이 아직 유효한 계정인지 DB로 확인한다.
 * 비밀번호를 바꾸거나 초기화하면 session_version이 올라가서 예전 토큰은 여기서 걸러진다
 */
export async function loadAccount(claims: SessionClaims): Promise<Account | null> {
  if (claims.role === "teacher") {
    const t = await prisma.teacher.findFirst({ where: { id: claims.teacherId, deletedAt: null } });
    if (!t || t.sessionVersion !== claims.v) return null;
    return { claims, name: t.name, isAdmin: t.isAdmin, mustChangePassword: t.mustChangePassword };
  }
  const s = await prisma.student.findFirst({
    where: { id: claims.studentId, teacherId: claims.teacherId, deletedAt: null, deactivatedAt: null, teacher: { deletedAt: null } },
  });
  if (!s || s.sessionVersion !== claims.v) return null;
  return { claims, name: s.name, isAdmin: false, mustChangePassword: s.mustChangePassword };
}

/**
 * 비밀번호 변경. 초기화된 계정(mustChangePassword)은 현재 비밀번호 없이 바꾼다 (방금 임시 비밀번호로 로그인했으므로).
 * 바꾸면 session_version을 올려 다른 기기의 로그인을 끊고, 새 토큰 값을 돌려준다
 */
export async function changePassword(
  account: Account,
  input: { current?: string; next: string; confirm: string },
): Promise<SessionClaims> {
  const { claims } = account;
  const row =
    claims.role === "teacher"
      ? await prisma.teacher.findFirstOrThrow({ where: { id: claims.teacherId, deletedAt: null } })
      : await prisma.student.findFirstOrThrow({ where: { id: claims.studentId, teacherId: claims.teacherId, deletedAt: null } });

  if (!account.mustChangePassword) {
    if (!input.current || !(await verifyPassword(input.current, row.passwordHash))) {
      throw new AuthError("현재 비밀번호가 올바르지 않습니다");
    }
  }
  const error = validatePassword(input.next);
  if (error) throw new AuthError(error);
  if (input.next !== input.confirm) throw new AuthError("새 비밀번호가 서로 다릅니다");
  if (await verifyPassword(input.next, row.passwordHash)) throw new AuthError("지금 비밀번호와 다른 비밀번호를 써 주세요");

  const data = {
    passwordHash: await hashPassword(input.next),
    mustChangePassword: false,
    sessionVersion: { increment: 1 },
  };
  // 동시에 다른 곳에서 바뀌었으면(버전이 다르면) 실패시킨다
  const where = { id: row.id, sessionVersion: claims.v, deletedAt: null };
  const { count } =
    claims.role === "teacher" ? await prisma.teacher.updateMany({ where, data }) : await prisma.student.updateMany({ where, data });
  if (count !== 1) throw new AuthError("다시 로그인해 주세요");
  return { ...claims, v: claims.v + 1 };
}
