import { Prisma } from "@/generated/prisma/client";
import { teacherDb, type ScopedDb } from "@/lib/db/scope";
import { monthRange, slotText, type YearMonth } from "./kst";
import { ScheduleError } from "./teacher";

// 학생의 수업 보기·예약·취소·옮기기 (SCH-03, 05, 08, 13). 세 값 모두 서버 세션(requireStudent)에서 나온다

export type StudentCtx = { db: ScopedDb; teacherId: string; studentId: string };

export type Tx = Parameters<Parameters<ScopedDb["$transaction"]>[0]>[0];

/** SCH-08: 예약·취소·옮기기는 수업 시작 1시간 전까지 */
export const CHANGE_DEADLINE_MS = 60 * 60_000;

export function changeDeadline(startsAt: Date) {
  return new Date(startsAt.getTime() - CHANGE_DEADLINE_MS);
}

export function canChange(startsAt: Date, now: Date) {
  return now.getTime() <= changeDeadline(startsAt).getTime();
}

/**
 * 슬롯별 참여 예정 학생 수 (SCH-02).
 * 학생 범위로는 다른 학생 수업이 안 보이므로, 같은 선생님 범위에서 숫자만 센다. 이름 등은 꺼내지 않는다
 */
async function participantCounts(teacherId: string, slotIds: string[]) {
  if (slotIds.length === 0) return new Map<string, number>();
  const rows = await teacherDb(teacherId).lesson.groupBy({
    by: ["slotId"],
    where: { slotId: { in: slotIds }, canceledAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.slotId, r._count._all]));
}

// ─── 보기 ──────────────────────────────────────────────────────

const LESSON_SELECT = {
  id: true,
  weeklyLessonId: true,
  attendance: true,
  canceledAt: true,
  slot: { select: { id: true, startsAt: true, endsAt: true } },
} as const;

type LessonRow = {
  id: string;
  weeklyLessonId: string | null;
  attendance: "COMPLETED" | "ABSENT" | null;
  canceledAt: Date | null;
  slot: { id: string; startsAt: Date; endsAt: Date };
};

export type MyLesson = {
  id: string;
  slotId: string;
  startsAt: Date;
  endsAt: Date;
  /** 고정 일정으로 잡힌 수업 */
  fixed: boolean;
  attendance: "COMPLETED" | "ABSENT" | null;
};

function toLesson(l: LessonRow): MyLesson {
  return { id: l.id, slotId: l.slot.id, startsAt: l.slot.startsAt, endsAt: l.slot.endsAt, fixed: l.weeklyLessonId !== null, attendance: l.attendance };
}

/** 취소하지 않은 내 수업. slot 조건은 관계 조건이라 deletedAt을 직접 넣는다 */
async function findMyLessons(db: ScopedDb, slot: Prisma.SlotWhereInput, order: "asc" | "desc", take?: number) {
  const rows = await db.lesson.findMany({
    where: { canceledAt: null, slot: { ...slot, deletedAt: null } },
    orderBy: { slot: { startsAt: order } },
    take,
    select: LESSON_SELECT,
  });
  return (rows as LessonRow[]).map(toLesson);
}

/** 수업 탭 다음 수업 카드 (APP-02). 진행 중인 수업도 들어간다 (끝나기 전까지 입장) */
export async function nextLesson(ctx: StudentCtx, now = new Date()) {
  const [lesson] = await findMyLessons(ctx.db, { endsAt: { gt: now } }, "asc", 1);
  if (!lesson) return null;
  const counts = await participantCounts(ctx.teacherId, [lesson.slotId]);
  return { ...lesson, participants: counts.get(lesson.slotId) ?? 1 };
}

/** 수업 탭 달력 (APP-02) */
export function monthLessons(ctx: StudentCtx, ym: YearMonth) {
  const { start, end } = monthRange(ym);
  return findMyLessons(ctx.db, { startsAt: { gte: start, lt: end } }, "asc");
}

/** 내 수업: 예정 (끝나지 않은 수업) */
export function upcomingLessons(ctx: StudentCtx, now = new Date()) {
  return findMyLessons(ctx.db, { endsAt: { gt: now } }, "asc");
}

/** 내 수업: 지난 수업 (최근 것부터) */
export function pastLessons(ctx: StudentCtx, now = new Date(), take = 100) {
  return findMyLessons(ctx.db, { endsAt: { lte: now } }, "desc", take);
}

/** 수업 화면. 취소한 수업도 보여 준다 (옮기고 나서 뒤로 왔을 때 등). 없으면 null */
export async function lessonDetail(ctx: StudentCtx, id: string, now = new Date()) {
  const row = (await ctx.db.lesson.findFirst({ where: { id, slot: { deletedAt: null } }, select: LESSON_SELECT })) as LessonRow | null;
  if (!row) return null;
  const lesson = toLesson(row);
  const counts = await participantCounts(ctx.teacherId, [lesson.slotId]);
  return {
    ...lesson,
    canceled: row.canceledAt !== null,
    participants: counts.get(lesson.slotId) ?? 0,
    past: lesson.endsAt <= now,
    canChange: row.canceledAt === null && canChange(lesson.startsAt, now),
    deadline: changeDeadline(lesson.startsAt),
  };
}

/** 내 고정 일정 (요일·시간 순) */
export async function myWeeklySchedule(ctx: StudentCtx) {
  const rows = await ctx.db.weeklyLesson.findMany({
    select: { id: true, weeklySlot: { select: { weekday: true, startMinute: true, endMinute: true } } },
  });
  return rows
    .map((r) => ({ id: r.id, ...r.weeklySlot }))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

export type BookableSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  participants: number;
  /** 이미 내 수업이 있으면 그 수업 */
  mine: { lessonId: string; fixed: boolean } | null;
};

/** SCH-13: 지금 예약할 수 있는 슬롯 (만들어진 앞으로의 슬롯 중 1시간 전 마감이 안 지난 것) */
export async function bookableSlots(ctx: StudentCtx, now = new Date()): Promise<BookableSlot[]> {
  const slots = await ctx.db.slot.findMany({
    where: { startsAt: { gte: new Date(now.getTime() + CHANGE_DEADLINE_MS) } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, endsAt: true },
  });
  const ids = slots.map((s) => s.id);
  const [counts, mine] = await Promise.all([
    participantCounts(ctx.teacherId, ids),
    ctx.db.lesson.findMany({ where: { slotId: { in: ids }, canceledAt: null }, select: { id: true, slotId: true, weeklyLessonId: true } }),
  ]);
  const mineBySlot = new Map(mine.map((l) => [l.slotId, { lessonId: l.id, fixed: l.weeklyLessonId !== null }]));
  return slots.map((s) => ({ ...s, participants: counts.get(s.id) ?? 0, mine: mineBySlot.get(s.id) ?? null }));
}

// ─── 예약·취소·옮기기 ─────────────────────────────────────────────

export const isUniqueError = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** 그 슬롯에 내 수업을 잡는다. 전에 취소한 수업이 있으면 되살린다 (slot·student는 UNIQUE) */
async function bookInTx(tx: Tx, slotId: string, now: Date) {
  const slot = await tx.slot.findUnique({ where: { id: slotId }, select: { id: true, startsAt: true } });
  if (!slot) throw new ScheduleError("없어진 수업 시간이에요. 목록을 새로 고쳐 주세요");
  if (!canChange(slot.startsAt, now)) throw new ScheduleError("수업 시작 1시간 전까지만 예약할 수 있어요");

  const existing = await tx.lesson.findFirst({ where: { slotId }, select: { id: true, canceledAt: true } });
  if (existing && existing.canceledAt === null) throw new ScheduleError("이미 예약한 수업이에요");

  let lessonId: string;
  if (existing) {
    // 동시에 두 번 눌러도 한 번만 되살린다
    const { count } = await tx.lesson.updateMany({ where: { id: existing.id, canceledAt: { not: null } }, data: { canceledAt: null } });
    if (count === 0) throw new ScheduleError("이미 예약한 수업이에요");
    lessonId = existing.id;
  } else {
    lessonId = (await tx.lesson.create({ data: { slotId } as never, select: { id: true } })).id;
  }
  return { lessonId, startsAt: slot.startsAt };
}

/** SCH-03: 예약 */
export async function bookSlot(ctx: StudentCtx, slotId: string, now = new Date()) {
  try {
    return await ctx.db.$transaction(async (tx) => {
      const { lessonId, startsAt } = await bookInTx(tx, slotId, now);
      await tx.scheduleChange.create({ data: { lessonId, action: "ADD", afterText: slotText(startsAt) } as never });
      return { lessonId };
    });
  } catch (e) {
    if (isUniqueError(e)) throw new ScheduleError("이미 예약한 수업이에요");
    throw e;
  }
}

/** 취소할 수 있는 내 수업을 취소 표시한다 */
async function cancelInTx(tx: Tx, lessonId: string, now: Date) {
  const lesson = await tx.lesson.findFirst({
    where: { id: lessonId, slot: { deletedAt: null } },
    select: { id: true, canceledAt: true, slot: { select: { id: true, startsAt: true } } },
  });
  if (!lesson) throw new ScheduleError("없는 수업이에요");
  if (lesson.canceledAt) throw new ScheduleError("이미 취소한 수업이에요");
  if (!canChange(lesson.slot.startsAt, now)) throw new ScheduleError("수업 시작 1시간 전이 지나서 바꿀 수 없어요");
  const { count } = await tx.lesson.updateMany({ where: { id: lessonId, canceledAt: null }, data: { canceledAt: now } });
  if (count === 0) throw new ScheduleError("이미 취소한 수업이에요");
  return lesson.slot;
}

/** SCH-05: 이번 회차만 취소. 선생님 알림(NOTI-02)은 5단계 */
export async function cancelLesson(ctx: StudentCtx, lessonId: string, now = new Date()) {
  return ctx.db.$transaction(async (tx) => {
    const slot = await cancelInTx(tx, lessonId, now);
    await tx.scheduleChange.create({ data: { lessonId, action: "CANCEL", beforeText: slotText(slot.startsAt) } as never });
    return { startsAt: slot.startsAt };
  });
}

/**
 * SCH-05: 다른 슬롯으로 옮기기. 지금 수업과 옮길 슬롯 모두 1시간 전 규칙을 지켜야 한다.
 * 지금 수업은 취소되고 옮길 슬롯에 새 수업(예약)이 생긴다. 이력은 지금 수업에 남긴다
 */
export async function moveLesson(ctx: StudentCtx, lessonId: string, slotId: string, now = new Date()) {
  try {
    return await ctx.db.$transaction((tx) => moveInTx(tx, lessonId, slotId, now));
  } catch (e) {
    if (isUniqueError(e)) throw new ScheduleError("이미 예약한 수업이에요");
    throw e;
  }
}

/** 옮기기 본체. 고정 일정 "이번만"(weekly.ts)도 같이 쓴다 */
export async function moveInTx(tx: Tx, lessonId: string, slotId: string, now: Date) {
  const from = await cancelInTx(tx, lessonId, now);
  if (from.id === slotId) throw new ScheduleError("지금 수업과 같은 시간이에요");
  const to = await bookInTx(tx, slotId, now);
  await tx.scheduleChange.create({
    data: { lessonId, action: "MOVE", beforeText: slotText(from.startsAt), afterText: slotText(to.startsAt) } as never,
  });
  return { lessonId: to.lessonId };
}
