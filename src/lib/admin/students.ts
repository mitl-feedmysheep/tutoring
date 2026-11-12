import type { ScopedDb } from "@/lib/db/scope";
import { hashPassword } from "@/lib/auth/password";

// 선생님의 학생 관리. db는 세션에서 만든 teacherDb

/** AUTH-07: 학생 비밀번호를 이 값으로 초기화한다 */
export const RESET_PASSWORD = "12341234";

export function listStudents(db: ScopedDb) {
  return db.student.findMany({
    where: { deactivatedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, birthYear: true, gender: true, mustChangePassword: true, createdAt: true },
  });
}

/**
 * AUTH-07, AUTH-08: 비밀번호를 초기화하고 다음 로그인 때 바꾸게 한다.
 * session_version을 올려 학생의 기존 로그인을 모두 끊는다. 내 학생이 아니면 false
 */
export async function resetStudentPassword(db: ScopedDb, studentId: string) {
  const { count } = await db.student.updateMany({
    where: { id: studentId, deactivatedAt: null },
    data: { passwordHash: await hashPassword(RESET_PASSWORD), mustChangePassword: true, sessionVersion: { increment: 1 } },
  });
  return count === 1;
}
