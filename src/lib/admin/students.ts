import type { ScopedDb } from "@/lib/db/scope";
import { isEmailTaken } from "@/lib/auth/accounts";
import { hashPassword } from "@/lib/auth/password";
import { weeklyText } from "@/lib/schedule/kst";
import { isUniqueError } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";

// 선생님의 학생 관리. db는 세션에서 만든 teacherDb

/** AUTH-07: 학생 비밀번호를 이 값으로 초기화한다 */
export const RESET_PASSWORD = "12341234";

const ID = /^[0-9a-f-]{36}$/;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !ID.test(id)) throw new ScheduleError("없는 학생이에요");
  return id;
}

/** 비활성화할 때 이메일 뒤에 붙이는 표시 (docs/db-design.md student). 같은 이메일로 새로 가입할 수 있게 비운다 */
const DEACTIVATED_MARK = "_deleted_";

/** 화면에 보여 줄 원래 이메일 */
export function originalEmail(email: string) {
  const i = email.lastIndexOf(DEACTIVATED_MARK);
  return i < 0 ? email : email.slice(0, i);
}

export function listStudents(db: ScopedDb) {
  return db.student.findMany({
    where: { deactivatedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, birthYear: true, gender: true, mustChangePassword: true, createdAt: true },
  });
}

/** ADMIN-04: 비활성 학생 (목록 아래에 따로, 최근 비활성화한 것부터) */
export async function listDeactivatedStudents(db: ScopedDb) {
  const rows = await db.student.findMany({
    where: { deactivatedAt: { not: null } },
    orderBy: { deactivatedAt: "desc" },
    select: { id: true, name: true, email: true, deactivatedAt: true },
  });
  return rows.map((r) => ({ ...r, email: originalEmail(r.email), deactivatedAt: r.deactivatedAt! }));
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

/** AUTH-05: 직업. 선생님이 입력하고, 비우면 없음 */
export async function setOccupation(db: ScopedDb, studentId: unknown, value: unknown) {
  const id = checkId(studentId);
  if (typeof value !== "string") throw new ScheduleError("잘못된 요청이에요");
  const text = value.trim();
  if (text.length > 100) throw new ScheduleError("직업은 100자 이하로 써 주세요");
  const { count } = await db.student.updateMany({ where: { id, deactivatedAt: null }, data: { occupation: text || null } });
  if (count === 0) throw new ScheduleError("없는 학생이에요");
}

/**
 * ADMIN-04: 비활성화. 로그인이 바로 끊기고, 앞으로의 수업은 취소된다 (이미 시작한 수업은 그대로).
 * 고정 일정은 비활성 동안 남겨 두고(학생 카드에서 볼 수 있게) 월말 생성에서만 빠진다. 다시 활성화할 때 끝낸다.
 * 이메일 뒤에 표시를 붙여 같은 이메일로 새 계정을 만들 수 있게 한다. 취소한 수업 수를 돌려준다
 */
export async function deactivateStudent(db: ScopedDb, studentId: unknown, now = new Date()) {
  const id = checkId(studentId);
  return db.$transaction(async (tx) => {
    const s = await tx.student.findFirst({ where: { id, deactivatedAt: null }, select: { id: true, email: true } });
    if (!s) throw new ScheduleError("없는 학생이에요");
    await tx.student.update({
      where: { id: s.id },
      data: { deactivatedAt: now, email: `${s.email}${DEACTIVATED_MARK}${now.getTime()}`, sessionVersion: { increment: 1 } },
    });
    const { count } = await tx.lesson.updateMany({
      where: { studentId: s.id, canceledAt: null, slot: { startsAt: { gt: now }, deletedAt: null } },
      data: { canceledAt: now },
    });
    return { canceled: count };
  });
}

/**
 * ADMIN-04: 다시 활성화. 원래 이메일로 돌린다. 그 이메일로 새 계정이 이미 있으면 막는다.
 * 오랜만에 돌아온 학생이라 일정은 비운 채로 시작한다: 예전 고정 일정은 끝내고(이력에 "자동"으로 남김),
 * 비활성화 때 취소된 수업도 되살리지 않는다. 일정은 학생이나 선생님이 새로 잡는다
 */
export async function reactivateStudent(db: ScopedDb, studentId: unknown, now = new Date()) {
  const id = checkId(studentId);
  try {
    return await db.$transaction(async (tx) => {
      const s = await tx.student.findFirst({ where: { id, deactivatedAt: { not: null } }, select: { id: true, email: true, deactivatedAt: true } });
      if (!s || !s.deactivatedAt) throw new ScheduleError("없는 학생이에요");
      const email = originalEmail(s.email);
      if (await isEmailTaken(email)) throw new ScheduleError("이 이메일로 가입한 다른 계정이 있어서 다시 활성화할 수 없어요");
      await tx.student.update({ where: { id: s.id }, data: { deactivatedAt: null, email } });

      const weekly = await tx.weeklyLesson.findMany({
        where: { studentId: s.id },
        select: { id: true, weeklySlot: { select: { weekday: true, startMinute: true, endMinute: true } } },
      });
      for (const wl of weekly) {
        await tx.weeklyLesson.update({ where: { id: wl.id }, data: { deletedAt: now } });
        await tx.scheduleChange.create({
          data: { studentId: s.id, weeklyLessonId: wl.id, action: "REMOVE", beforeText: weeklyText(wl.weeklySlot), changedBy: "SYSTEM", reason: "다시 활성화해서 일정을 비움" } as never,
        });
      }
    });
  } catch (e) {
    // 확인과 저장 사이에 같은 이메일로 누가 가입한 경우
    if (isUniqueError(e)) throw new ScheduleError("이 이메일로 가입한 다른 계정이 있어서 다시 활성화할 수 없어요");
    throw e;
  }
}
