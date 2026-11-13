import type { ScopedDb } from "@/lib/db/scope";
import { monthDate, monthRange, weeklyOccurrences, weeklyText, type YearMonth } from "./kst";

// 월 단위 일괄 생성 (SCH-11). db는 그 선생님의 teacherDb

type Tx = Parameters<Parameters<ScopedDb["$transaction"]>[0]>[0];
type WeeklyTime = { id: string; weekday: number; startMinute: number; endMinute: number };

/** 그 달을 이미 만들었는지 (monthly_slot_history 기록) */
export async function isMonthGenerated(db: ScopedDb | Tx, ym: YearMonth) {
  return (await db.monthlySlotHistory.count({ where: { month: monthDate(ym) } })) > 0;
}

/**
 * 고정 시간 하나의 슬롯을 그 달에 만든다. after보다 늦은 것만.
 * UNIQUE (weekly_slot_id, starts_at) + skipDuplicates라서 이미 있거나 선생님이 지운 날은 다시 생기지 않는다
 */
export async function createWeeklySlotsInMonth(tx: Tx, w: WeeklyTime, ym: YearMonth, after: Date) {
  const data = weeklyOccurrences(w, ym, after).map((o) => ({ weeklySlotId: w.id, ...o }));
  if (data.length === 0) return;
  await tx.slot.createMany({ data: data as never, skipDuplicates: true });
}

/**
 * 그 달 전체를 만든다. 이미 만든 달이면 아무것도 하지 않고 null.
 * - 고정 시간 → 슬롯, 학생 고정 일정 → 수업
 * - 선생님이 지운 고정 시간에 남아 있던 학생 고정 일정은 여기서 끝낸다 (SCH-15). 끝난 목록을 돌려준다. 학생 알림(NOTI-06)은 이 이력을 보고 스케줄러가 보낸다
 */
export async function generateMonth(db: ScopedDb, ym: YearMonth, now: Date) {
  return db.$transaction(async (tx) => {
    if (await isMonthGenerated(tx, ym)) return null;
    await tx.monthlySlotHistory.create({ data: { month: monthDate(ym) } as never });

    const { start, end } = monthRange(ym);
    const weeklySlots = await tx.weeklySlot.findMany({
      select: {
        id: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
        weeklyLessons: { where: { student: { deactivatedAt: null, deletedAt: null } }, select: { id: true, studentId: true } },
      },
    });

    for (const w of weeklySlots) {
      await createWeeklySlotsInMonth(tx, w, ym, now);
      if (w.weeklyLessons.length === 0) continue;
      const slots = await tx.slot.findMany({ where: { weeklySlotId: w.id, startsAt: { gte: start, lt: end } }, select: { id: true } });
      const lessons = slots.flatMap((s) => w.weeklyLessons.map((wl) => ({ slotId: s.id, studentId: wl.studentId, weeklyLessonId: wl.id })));
      if (lessons.length) await tx.lesson.createMany({ data: lessons as never, skipDuplicates: true });
    }

    // 고정 시간이 지워진 학생 고정 일정 → 이번 달 말로 끝
    const ended = await tx.weeklyLesson.findMany({
      where: { weeklySlotId: { notIn: weeklySlots.map((w) => w.id) } },
      select: { id: true, studentId: true, weeklySlot: { select: { weekday: true, startMinute: true, endMinute: true } } },
    });
    for (const wl of ended) {
      await tx.weeklyLesson.update({ where: { id: wl.id }, data: { deletedAt: now } });
      await tx.scheduleChange.create({
        data: { studentId: wl.studentId, weeklyLessonId: wl.id, action: "REMOVE", beforeText: weeklyText(wl.weeklySlot), changedBy: "SYSTEM" } as never,
      });
    }
    return { endedWeeklyLessons: ended.map((wl) => ({ id: wl.id, studentId: wl.studentId })) };
  });
}
