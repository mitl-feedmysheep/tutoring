import { studentDbByTeacher, type ScopedDb } from "@/lib/db/scope";
import type { StudentCtx } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { originalEmail } from "./students";

// 선생님이 학생 일정을 대신 바꾸기 (SCH-16)와 변경 이력 (SCH-17).
// db·teacherId는 서버 세션(requireTeacher)에서, studentId는 화면에서 오므로 내 학생인지 먼저 확인한다

const ID = /^[0-9a-f-]{36}$/;

/** 내 (활성) 학생이면 그 학생 일정을 바꿀 수 있는 ctx. 예약·취소·옮기기·고정 일정 로직(student.ts, weekly.ts)을 그대로 쓴다 */
export async function teacherStudentCtx(db: ScopedDb, teacherId: string, studentId: unknown, reason?: string): Promise<StudentCtx> {
  if (typeof studentId !== "string" || !ID.test(studentId)) throw new ScheduleError("없는 학생이에요");
  const student = await db.student.findFirst({ where: { id: studentId, deactivatedAt: null }, select: { id: true } });
  if (!student) throw new ScheduleError("없는 학생이에요");
  return { db: studentDbByTeacher(teacherId, student.id), teacherId, studentId: student.id, byTeacher: true, reason };
}

/** 학생 카드 위쪽 프로필. 비활성 학생도 기록을 보도록 돌려준다 (ADMIN-04). 내 학생이 아니면 null */
export async function studentProfile(db: ScopedDb, studentId: string) {
  if (!ID.test(studentId)) return null;
  const s = await db.student.findFirst({
    where: { id: studentId },
    select: { id: true, name: true, email: true, birthYear: true, gender: true, occupation: true, createdAt: true, deactivatedAt: true },
  });
  return s && { ...s, email: originalEmail(s.email) };
}

/** SCH-17: 일정 변경 이력 (수업 1회 + 고정 일정), 최근 것부터 */
export function scheduleHistory(db: ScopedDb, studentId: string, take = 100) {
  return db.scheduleChange.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, beforeText: true, afterText: true, changedBy: true, reason: true, createdAt: true, weeklyLessonId: true },
  });
}
