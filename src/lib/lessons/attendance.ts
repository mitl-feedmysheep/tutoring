import type { Prisma } from "@/generated/prisma/client";
import type { ScopedDb } from "@/lib/db/scope";
import { ScheduleError } from "@/lib/schedule/teacher";

// 수업 기록: 참석·결석 체크 (LESSON-01, 03)와 학생별 수업 이력 (LESSON-02).
// db는 서버 세션에서 만든 teacherDb. 학생 범위에서는 범위 계층이 출석 쓰기를 막는다

export type Attendance = "COMPLETED" | "ABSENT";

const ID = /^[0-9a-f-]{36}$/;

/** 체크할 수 있는 수업: 취소 안 했고, 슬롯이 남아 있고, 시작한 수업 */
const recordable = (now: Date): Prisma.LessonWhereInput => ({
  canceledAt: null,
  slot: { deletedAt: null, startsAt: { lte: now } },
});

/** LESSON-01, 03: 참석·결석 체크. null이면 체크를 푼다 */
export async function setAttendance(db: ScopedDb, lessonId: unknown, value: unknown, now = new Date()) {
  if (typeof lessonId !== "string" || !ID.test(lessonId)) throw new ScheduleError("잘못된 요청이에요");
  if (value !== null && value !== "COMPLETED" && value !== "ABSENT") throw new ScheduleError("잘못된 요청이에요");

  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, canceledAt: null, slot: { deletedAt: null } },
    select: { id: true, slot: { select: { startsAt: true } } },
  });
  if (!lesson) throw new ScheduleError("없는 수업이에요");
  if (lesson.slot.startsAt > now) throw new ScheduleError("수업이 시작한 뒤에 체크할 수 있어요");

  // 확인과 수정 사이에 취소·삭제되는 경우까지 조건으로 한 번 더 막는다
  const { count } = await db.lesson.updateMany({ where: { id: lesson.id, ...recordable(now) }, data: { attendance: value } });
  if (count === 0) throw new ScheduleError("없는 수업이에요");
}

/** LESSON-02: 학생별 수업 이력 (시작한 수업, 최근 것부터)과 합계 */
export async function lessonRecords(db: ScopedDb, studentId: string, now = new Date(), take = 100) {
  const where: Prisma.LessonWhereInput = { studentId, ...recordable(now) };
  const [rows, groups] = await Promise.all([
    db.lesson.findMany({
      where,
      orderBy: { slot: { startsAt: "desc" } },
      take,
      select: { id: true, attendance: true, weeklyLessonId: true, slot: { select: { startsAt: true, endsAt: true } } },
    }),
    db.lesson.groupBy({ by: ["attendance"], where, _count: { _all: true } }),
  ]);
  const count = (a: Attendance | null) => groups.find((g) => g.attendance === a)?._count._all ?? 0;
  return {
    lessons: rows.map((l) => ({ id: l.id, startsAt: l.slot.startsAt, endsAt: l.slot.endsAt, fixed: l.weeklyLessonId !== null, attendance: l.attendance })),
    totals: { completed: count("COMPLETED"), absent: count("ABSENT"), unchecked: count(null) },
  };
}
