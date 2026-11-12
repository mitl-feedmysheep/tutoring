import { prisma } from "@/lib/db/client";
import { createTeacher } from "./accounts";
import type { Account } from "./login";

// ADMIN-05: 시스템 관리자의 선생님 계정 관리.
// 선생님 범위를 넘는 작업이라 원본 클라이언트를 쓰고, 함수마다 관리자인지 직접 확인한다

export class NotAdminError extends Error {
  constructor() {
    super("시스템 관리자만 할 수 있어요");
    this.name = "NotAdminError";
  }
}

function assertAdmin(actor: Account) {
  if (actor.claims.role !== "teacher" || !actor.isAdmin) throw new NotAdminError();
}

/** 선생님 목록. 학생 데이터는 선생님마다 분리되므로 계정 정보만 보여준다 */
export function listTeachers(actor: Account) {
  assertAdmin(actor);
  return prisma.teacher.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, isAdmin: true, mustChangePassword: true, createdAt: true },
  });
}

/** 새 선생님은 임시 비밀번호로 만들고 첫 로그인 때 바꾸게 한다. 관리자 권한은 주지 않는다 (스크립트로만) */
export function createTeacherByAdmin(actor: Account, input: { name: string; email: string; password: string }) {
  assertAdmin(actor);
  return createTeacher({ ...input, isAdmin: false, mustChangePassword: true });
}
