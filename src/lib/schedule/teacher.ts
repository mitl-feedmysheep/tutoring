import type { ScopedDb } from "@/lib/db/scope";
import { createWeeklySlotsInMonth, isMonthGenerated } from "./generate";
import { addMonths, kstParts, kstToUtc, monthKey, monthOf, monthRange, slotText, weeklyText, type YearMonth } from "./kst";

// 선생님의 고정 수업 시간·슬롯 관리 (SCH-01, 02, 11, 12, 15). db는 세션에서 만든 teacherDb

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

export type TimeRange = { startMinute: number; endMinute: number };
export type WeeklyInput = TimeRange & { weekday: number };

function checkRange({ startMinute, endMinute }: TimeRange) {
  const ok = (m: number) => Number.isInteger(m) && m >= 0 && m <= 24 * 60 && m % 5 === 0;
  if (!ok(startMinute) || !ok(endMinute)) throw new ScheduleError("시간은 5분 단위로 정해 주세요");
  if (startMinute >= endMinute) throw new ScheduleError("끝나는 시간이 시작 시간보다 늦어야 해요");
  if (startMinute >= 24 * 60) throw new ScheduleError("시작 시간을 다시 확인해 주세요");
}

function checkWeekly(input: WeeklyInput) {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new ScheduleError("요일을 골라 주세요");
  checkRange(input);
}

async function checkWeeklyOverlap(db: Tx, input: WeeklyInput, exceptId?: string) {
  const clash = await db.weeklySlot.count({
    where: {
      weekday: input.weekday,
      startMinute: { lt: input.endMinute },
      endMinute: { gt: input.startMinute },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (clash) throw new ScheduleError("같은 요일에 겹치는 고정 시간이 있어요");
}

type Tx = Parameters<Parameters<ScopedDb["$transaction"]>[0]>[0];

/** 슬롯이 그날의 고정 시간과 겹치는지 (KST 기준. 슬롯은 하루 안에서 끝난다) */
export function clashesWeekly(slot: { startsAt: Date; endsAt: Date }, w: WeeklyInput) {
  const p = kstParts(slot.startsAt);
  if (p.weekday !== w.weekday) return false;
  return slot.startsAt < kstToUtc(p.year, p.month, p.day, w.endMinute) && slot.endsAt > kstToUtc(p.year, p.month, p.day, w.startMinute);
}

/**
 * SCH-18: 고정 시간을 등록·변경할 때, from 이후 이미 있는 슬롯(1회성, 예약이 남은 옛 슬롯 등)과 겹치면 막는다.
 * 겹치는 날을 건너뛰면 그날 고정 일정 학생의 수업이 빠지므로, 선생님이 그 슬롯을 먼저 정리하게 한다
 */
async function checkSlotClash(tx: Tx, input: WeeklyInput, from: Date, exceptWeeklySlotId?: string) {
  const slots = await tx.slot.findMany({
    where: {
      startsAt: { gte: from },
      ...(exceptWeeklySlotId ? { OR: [{ weeklySlotId: null }, { weeklySlotId: { not: exceptWeeklySlotId } }] } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, endsAt: true },
  });
  const clash = slots.find((s) => clashesWeekly(s, input));
  if (clash) throw new ScheduleError(`${slotText(clash.startsAt)} 슬롯과 시간이 겹쳐요. 그 슬롯을 지우거나 시간을 다르게 정해 주세요`);
}

/** 지금부터 만들어져 있어야 하는 달들: 이번 달 + (월말 생성이 끝났으면) 다음 달 */
async function openMonths(tx: Tx, now: Date): Promise<YearMonth[]> {
  const cur = monthOf(now);
  const next = addMonths(cur, 1);
  return (await isMonthGenerated(tx, next)) ? [cur, next] : [cur];
}

async function generateFor(tx: Tx, w: WeeklyInput & { id: string }, now: Date) {
  for (const ym of await openMonths(tx, now)) await createWeeklySlotsInMonth(tx, w, ym, now);
}

/** 앞으로의 슬롯 중 수업이 하나도 없는 것을 지운다 (취소된 수업만 있는 슬롯도 빈 슬롯) */
async function deleteEmptyFutureSlots(tx: Tx, weeklySlotId: string, now: Date) {
  await tx.slot.updateMany({
    where: { weeklySlotId, startsAt: { gt: now }, lessons: { none: { canceledAt: null, deletedAt: null } } },
    data: { deletedAt: now },
  });
}

// ─── 고정 수업 시간 ──────────────────────────────────────────────

export async function listWeeklySlots(db: ScopedDb) {
  const rows = await db.weeklySlot.findMany({
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    select: {
      id: true,
      weekday: true,
      startMinute: true,
      endMinute: true,
      weeklyLessons: { where: { student: { deactivatedAt: null, deletedAt: null } }, select: { student: { select: { name: true } } } },
    },
  });
  return rows.map(({ weeklyLessons, ...w }) => ({ ...w, students: weeklyLessons.map((wl) => wl.student.name) }));
}

/** SCH-11: 등록하면 이번 달 남은 날짜(월말 생성이 끝났으면 다음 달까지)의 슬롯을 바로 만든다 */
export async function createWeeklySlot(db: ScopedDb, input: WeeklyInput, now = new Date()) {
  checkWeekly(input);
  return db.$transaction(async (tx) => {
    await checkWeeklyOverlap(tx, input);
    await checkSlotClash(tx, input, now);
    const w = await tx.weeklySlot.create({ data: input as never });
    await generateFor(tx, w, now);
    return w;
  });
}

export type WeeklyChangeResult = { applied: "now" } | { applied: "later"; fromMonth: YearMonth; students: number };

/**
 * SCH-15: 고정 시간 바꾸기
 * - 그 시간에 고정 일정을 둔 학생이 없으면 바로 반영한다. 앞으로의 빈 슬롯을 지우고 새 시간으로 다시 만든다
 * - 학생이 있으면 사유를 받고 시간만 고친다. 이미 만든 달은 그대로, 다음 생성부터 새 시간. 학생 고정 일정은 따라간다
 */
export async function updateWeeklySlot(db: ScopedDb, id: string, input: WeeklyInput, reason: string | undefined, now = new Date()): Promise<WeeklyChangeResult> {
  checkWeekly(input);
  return db.$transaction(async (tx) => {
    const w = await tx.weeklySlot.findUnique({ where: { id }, include: { weeklyLessons: { select: { id: true, studentId: true } } } });
    if (!w) throw new ScheduleError("없는 고정 시간이에요");
    if (w.weekday === input.weekday && w.startMinute === input.startMinute && w.endMinute === input.endMinute) {
      throw new ScheduleError("바뀐 내용이 없어요");
    }
    await checkWeeklyOverlap(tx, input, id);

    if (w.weeklyLessons.length === 0) {
      // 새 행으로 바꾼다. 같은 행의 시간을 고치면 지운 슬롯과 시작 시각이 겹쳐 다시 만들어지지 않을 수 있다
      await tx.weeklySlot.update({ where: { id }, data: { deletedAt: now } });
      await deleteEmptyFutureSlots(tx, id, now);
      // 예약이 남아 지우지 못한 옛 시간 슬롯도 겹치면 막는다
      await checkSlotClash(tx, input, now);
      const created = await tx.weeklySlot.create({ data: input as never });
      await generateFor(tx, created, now);
      return { applied: "now" };
    }

    const why = checkReason(reason);
    // 새 시간은 아직 만들지 않은 달부터 쓰인다. 그 달들에 미리 만든 슬롯과 겹치면 막는다
    const opened = await openMonths(tx, now);
    await checkSlotClash(tx, input, monthRange(addMonths(opened[opened.length - 1], 1)).start, id);
    await tx.weeklySlot.update({ where: { id }, data: input });
    for (const wl of w.weeklyLessons) {
      await tx.scheduleChange.create({
        data: {
          studentId: wl.studentId,
          weeklyLessonId: wl.id,
          action: "CHANGE",
          beforeText: weeklyText(w),
          afterText: weeklyText(input),
          changedBy: "TEACHER",
          reason: why,
        } as never,
      });
    }
    const months = await openMonths(tx, now);
    return { applied: "later", fromMonth: addMonths(months[months.length - 1], 1), students: w.weeklyLessons.length };
  });
}

/**
 * SCH-15: 고정 시간 지우기
 * - 학생이 없으면 앞으로의 빈 슬롯도 같이 지운다
 * - 학생이 있으면 이미 만든 달은 그대로 두고, 다음 월말 생성 때 학생 고정 일정이 끝난다
 */
export async function deleteWeeklySlot(db: ScopedDb, id: string, now = new Date()): Promise<WeeklyChangeResult> {
  return db.$transaction(async (tx) => {
    const w = await tx.weeklySlot.findUnique({ where: { id }, include: { _count: { select: { weeklyLessons: true } } } });
    if (!w) throw new ScheduleError("없는 고정 시간이에요");
    await tx.weeklySlot.update({ where: { id }, data: { deletedAt: now } });
    const students = w._count.weeklyLessons;
    if (students === 0) {
      await deleteEmptyFutureSlots(tx, id, now);
      return { applied: "now" };
    }
    const months = await openMonths(tx, now);
    return { applied: "later", fromMonth: addMonths(months[months.length - 1], 1), students };
  });
}

function checkReason(reason: string | undefined) {
  const r = reason?.trim();
  if (!r) throw new ScheduleError("고정 일정이 있는 학생이 있어서 바꾸는 이유를 적어야 해요");
  if (r.length > 200) throw new ScheduleError("이유는 200자 이하로 써 주세요");
  return r;
}

// ─── 슬롯 ──────────────────────────────────────────────────────

/** 달력에 보여 줄 그 달 슬롯과 예약 학생 (SCH-02) */
export async function listMonthSlots(db: ScopedDb, ym: YearMonth) {
  const { start, end } = monthRange(ym);
  const rows = await db.slot.findMany({
    where: { startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      weeklySlotId: true,
      lessons: {
        where: { canceledAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, studentId: true, weeklyLessonId: true, attendance: true, student: { select: { name: true } } },
      },
    },
  });
  return rows.map(({ lessons, ...s }) => ({
    ...s,
    students: lessons.map((l) => ({ lessonId: l.id, studentId: l.studentId, name: l.student.name, fixed: l.weeklyLessonId !== null, attendance: l.attendance })),
  }));
}

/** SCH-12: 1회성 슬롯. 지난 시간과, 이미 있는 슬롯과 겹치는 시간은 안 된다 */
export async function createOneOffSlot(db: ScopedDb, input: TimeRange & { year: number; month: number; day: number }, now = new Date()) {
  checkRange(input);
  const startsAt = kstToUtc(input.year, input.month, input.day, input.startMinute);
  const endsAt = kstToUtc(input.year, input.month, input.day, input.endMinute);
  if (startsAt <= now) throw new ScheduleError("지난 시간에는 슬롯을 만들 수 없어요");
  return db.$transaction(async (tx) => {
    const clash = await tx.slot.count({ where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (clash) throw new ScheduleError("그 시간에 이미 슬롯이 있어요");
    // 아직 만들지 않은 달이면, 월말에 고정 시간 슬롯이 생길 자리와도 겹치면 안 된다 (SCH-18)
    const opened = (await openMonths(tx, now)).map(monthKey);
    if (!opened.includes(monthKey(monthOf(startsAt)))) {
      const weekly = await tx.weeklySlot.findMany({ where: { weekday: kstParts(startsAt).weekday }, select: { weekday: true, startMinute: true, endMinute: true } });
      const hit = weekly.find((w) => clashesWeekly({ startsAt, endsAt }, w));
      if (hit) throw new ScheduleError(`고정 수업 시간(${weeklyText(hit)})과 겹쳐요`);
    }
    return tx.slot.create({ data: { startsAt, endsAt } as never });
  });
}

/**
 * SCH-01, SCH-10: 슬롯 지우기. 이미 시작했거나 지난 슬롯은 못 지운다.
 * 예약된 수업도 같이 지운다. 예약했던 학생 id(NOTI-03 알림용)와 구글 일정 id(MEET-07)를 돌려준다
 */
export async function deleteSlot(db: ScopedDb, id: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id }, include: { lessons: { where: { canceledAt: null }, select: { studentId: true } } } });
    if (!slot) throw new ScheduleError("없는 슬롯이에요");
    if (slot.startsAt <= now) throw new ScheduleError("이미 시작했거나 지난 수업은 지울 수 없어요");
    await tx.slot.update({ where: { id }, data: { deletedAt: now } });
    await tx.lesson.updateMany({ where: { slotId: id }, data: { deletedAt: now } });
    return {
      slot: { id: slot.id, startsAt: slot.startsAt, meetingProvider: slot.meetingProvider, meetingExternalId: slot.meetingExternalId },
      studentIds: slot.lessons.map((l) => l.studentId),
    };
  });
}
