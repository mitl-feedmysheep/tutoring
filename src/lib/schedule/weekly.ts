import { addMonths, formatMinute, kstParts, monthOf, WEEKDAYS, weeklyText, type YearMonth } from "./kst";
import { CHANGE_DEADLINE_MS, isUniqueError, moveInTx, type StudentCtx, type Tx } from "./student";
import { ScheduleError } from "./teacher";

// 학생 고정 일정 고르기·바꾸기 (SCH-04, SCH-14, SCH-15). ctx는 서버 세션(requireStudent)에서 나온다
//
// 화면에서 선생님 고정 시간 중 원하는 것들을 고르면, 지금 고정 일정과 비교해 바뀐 것을 나눈다
// - 바꾸기(빠진 것 ↔ 새로 고른 것을 요일·시간 순으로 짝지음), 추가, 빼기
// - "앞으로 전부": 1시간 안에 시작하는 수업만 빼고 이미 만들어진 앞으로의 수업을 바꾼다. 다음 달부터는 월말 생성이 새 일정으로 만든다
// - "이번만": 1개를 1개로 바꿀 때만. 옛 시간의 가장 가까운 수업 하나를 새 시간의 가장 가까운 수업으로 옮긴다 (고정 일정은 그대로)

type WeeklyTime = { weekday: number; startMinute: number; endMinute: number };
export type WeeklyItem = WeeklyTime & { weeklySlotId: string };

/** "목 19:00" */
export function shortWeeklyText(w: { weekday: number; startMinute: number }) {
  return `${WEEKDAYS[w.weekday]} ${formatMinute(w.startMinute)}`;
}

const byTime = (a: WeeklyTime, b: WeeklyTime) => a.weekday - b.weekday || a.startMinute - b.startMinute;

const deadlineOf = (now: Date) => new Date(now.getTime() + CHANGE_DEADLINE_MS);

// ─── 보기 ──────────────────────────────────────────────────────

export type WeeklyChoice = WeeklyTime & {
  id: string;
  /** 지금 내 고정 일정 */
  mine: boolean;
  /** 선생님이 시간을 바꿔서 이 달부터 새 시간 (이미 만든 달은 옛 시간, SCH-15) */
  changing: { from: YearMonth; old: WeeklyTime } | null;
  /** 선생님이 지운 고정 시간. 이 달부터 수업이 안 생긴다 (내 일정일 때만 목록에 남는다) */
  ending: YearMonth | null;
};

/** 고정 일정 화면: 선생님 고정 시간 목록 + 내 것 표시 + 선생님이 바꾸는 중인 내용 */
export async function weeklyChoices(ctx: StudentCtx, now = new Date()): Promise<WeeklyChoice[]> {
  const [open, mine] = await Promise.all([
    ctx.db.weeklySlot.findMany({ select: { id: true, weekday: true, startMinute: true, endMinute: true } }),
    // 관계(weeklySlot)는 지운 행도 딸려 온다. 선생님이 지운 고정 시간에 남은 내 일정을 보여 주려고 쓴다
    ctx.db.weeklyLesson.findMany({ select: { weeklySlot: { select: { id: true, weekday: true, startMinute: true, endMinute: true, deletedAt: true } } } }),
  ]);
  const mineIds = new Set(mine.map((m) => m.weeklySlot.id));
  const ended = mine.map((m) => m.weeklySlot).filter((w) => w.deletedAt !== null);
  const all = [...open, ...ended.map((w) => ({ id: w.id, weekday: w.weekday, startMinute: w.startMinute, endMinute: w.endMinute }))];

  // 고정 시간마다 마지막으로 만들어진 슬롯. 시간이 다르면 선생님이 바꾼 것이고, 그 다음 달부터 새 시간이다
  const latest = new Map<string, Date>();
  const slots = await ctx.db.slot.findMany({
    where: { weeklySlotId: { in: all.map((w) => w.id) } },
    orderBy: { startsAt: "asc" },
    select: { weeklySlotId: true, startsAt: true },
  });
  for (const s of slots) latest.set(s.weeklySlotId!, s.startsAt);

  return all
    .map((w) => {
      const last = latest.get(w.id);
      const isEnded = ended.some((e) => e.id === w.id);
      let changing: WeeklyChoice["changing"] = null;
      if (!isEnded && last && last > now) {
        const p = kstParts(last);
        if (p.weekday !== w.weekday || p.minute !== w.startMinute) {
          changing = { from: addMonths(monthOf(last), 1), old: { weekday: p.weekday, startMinute: p.minute, endMinute: p.minute + (w.endMinute - w.startMinute) } };
        }
      }
      const ending = isEnded ? addMonths(last && last > now ? monthOf(last) : monthOf(now), 1) : null;
      return { ...w, mine: mineIds.has(w.id), changing, ending };
    })
    .sort(byTime);
}

// ─── 바꿀 내용 계산 ──────────────────────────────────────────────

export type WeeklyPlan = {
  changes: { weeklyLessonId: string; from: WeeklyItem; to: WeeklyItem; firstAt: Date | null }[];
  adds: { to: WeeklyItem; firstAt: Date | null }[];
  removes: { weeklyLessonId: string; from: WeeklyItem; firstAt: Date | null }[];
  /** "이번만"으로 옮길 수업. 1개 → 1개가 아니거나 옮길 수업·시간이 없으면 null */
  once: { lessonId: string; slotId: string; fromAt: Date; toAt: Date } | null;
  /** 1시간 안에 시작해서 그대로 두는 내 고정 수업 수 */
  keptSoon: number;
};

function checkIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length > 30 || ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id))) {
    throw new ScheduleError("잘못된 요청이에요");
  }
  return [...new Set(ids as string[])];
}

/** 이 고정 시간에서 바꿀 수 있는 첫 슬롯 (1시간 전 마감이 안 지난 것) */
async function firstSlotAt(tx: Tx, weeklySlotId: string, deadline: Date) {
  const s = await tx.slot.findFirst({ where: { weeklySlotId, startsAt: { gte: deadline } }, orderBy: { startsAt: "asc" }, select: { startsAt: true } });
  return s?.startsAt ?? null;
}

/** 이 고정 일정으로 잡힌, 아직 바꿀 수 있는 내 수업 */
function changeableLessons(weeklyLessonId: string, deadline: Date) {
  return { weeklyLessonId, canceledAt: null, slot: { startsAt: { gte: deadline }, deletedAt: null } };
}

async function computePlan(tx: Tx, rawIds: unknown, now: Date): Promise<WeeklyPlan> {
  const ids = checkIds(rawIds);
  const deadline = deadlineOf(now);

  const current = await tx.weeklyLesson.findMany({
    select: { id: true, weeklySlot: { select: { id: true, weekday: true, startMinute: true, endMinute: true } } },
  });
  const currentIds = new Set(current.map((c) => c.weeklySlot.id));
  // 새로 고르는 것은 지금 열려 있는 선생님 고정 시간이어야 한다 (지운 것, 다른 선생님 것은 안 보인다)
  const picked = await tx.weeklySlot.findMany({
    where: { id: { in: ids.filter((id) => !currentIds.has(id)) } },
    select: { id: true, weekday: true, startMinute: true, endMinute: true },
  });
  if (picked.length !== ids.filter((id) => !currentIds.has(id)).length) throw new ScheduleError("없어진 고정 시간이 있어요. 화면을 새로 고쳐 주세요");

  const toItem = (w: { id: string } & WeeklyTime): WeeklyItem => ({ weeklySlotId: w.id, weekday: w.weekday, startMinute: w.startMinute, endMinute: w.endMinute });
  const removed = current.filter((c) => !ids.includes(c.weeklySlot.id)).sort((a, b) => byTime(a.weeklySlot, b.weeklySlot));
  const added = picked.map(toItem).sort(byTime);
  if (removed.length === 0 && added.length === 0) throw new ScheduleError("바뀐 내용이 없어요");

  const pairs = Math.min(removed.length, added.length);
  const firstLessonAt = async (weeklyLessonId: string) => {
    const l = await tx.lesson.findFirst({ where: changeableLessons(weeklyLessonId, deadline), orderBy: { slot: { startsAt: "asc" } }, select: { slot: { select: { startsAt: true } } } });
    return l?.slot.startsAt ?? null;
  };

  const plan: WeeklyPlan = { changes: [], adds: [], removes: [], once: null, keptSoon: 0 };
  for (let i = 0; i < pairs; i++) {
    plan.changes.push({ weeklyLessonId: removed[i].id, from: toItem(removed[i].weeklySlot), to: added[i], firstAt: await firstSlotAt(tx, added[i].weeklySlotId, deadline) });
  }
  for (const to of added.slice(pairs)) plan.adds.push({ to, firstAt: await firstSlotAt(tx, to.weeklySlotId, deadline) });
  for (const r of removed.slice(pairs)) plan.removes.push({ weeklyLessonId: r.id, from: toItem(r.weeklySlot), firstAt: await firstLessonAt(r.id) });

  const touched = [...plan.changes, ...plan.removes].map((c) => c.weeklyLessonId);
  if (touched.length) {
    plan.keptSoon = await tx.lesson.count({
      where: { weeklyLessonId: { in: touched }, canceledAt: null, slot: { startsAt: { gt: now, lt: deadline }, deletedAt: null } },
    });
  }

  if (plan.changes.length === 1 && plan.adds.length === 0 && plan.removes.length === 0) {
    plan.once = await oncePair(tx, plan.changes[0], deadline);
  }
  return plan;
}

/** "이번만": 옛 시간의 다음 수업 하나 → 새 시간 슬롯 중 그 수업과 가장 가까운 것 (같으면 앞의 것) */
async function oncePair(tx: Tx, change: WeeklyPlan["changes"][number], deadline: Date): Promise<WeeklyPlan["once"]> {
  const from = await tx.lesson.findFirst({
    where: changeableLessons(change.weeklyLessonId, deadline),
    orderBy: { slot: { startsAt: "asc" } },
    select: { id: true, slot: { select: { startsAt: true } } },
  });
  if (!from) return null;
  const all = await tx.slot.findMany({
    where: { weeklySlotId: change.to.weeklySlotId, startsAt: { gte: deadline } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true },
  });
  // 이미 내 수업이 있는 슬롯은 빠진다. where 안 관계 조건에는 범위가 안 붙으므로 내 수업을 따로 읽는다
  const booked = await tx.lesson.findMany({ where: { slotId: { in: all.map((s) => s.id) }, canceledAt: null }, select: { slotId: true } });
  const bookedIds = new Set(booked.map((l) => l.slotId));
  const slots = all.filter((s) => !bookedIds.has(s.id));
  const gap = (d: Date) => Math.abs(d.getTime() - from.slot.startsAt.getTime());
  const best = slots.reduce<(typeof slots)[number] | null>((b, s) => (b === null || gap(s.startsAt) < gap(b.startsAt) ? s : b), null);
  return best ? { lessonId: from.id, slotId: best.id, fromAt: from.slot.startsAt, toAt: best.startsAt } : null;
}

/** 확인창에 보여 줄 내용 */
export function planWeeklyChange(ctx: StudentCtx, ids: unknown, now = new Date()) {
  return ctx.db.$transaction((tx) => computePlan(tx, ids, now));
}

// ─── 바꾸기 ──────────────────────────────────────────────────────

/** 고정 일정을 이 고정 시간에 붙인다: 앞으로의 슬롯마다 내 수업을 잡는다. 있던 수업(취소한 것, 예약한 것)은 고정 수업으로 바꾼다 */
async function attachLessons(tx: Tx, weeklyLessonId: string, weeklySlotId: string, deadline: Date) {
  const slots = await tx.slot.findMany({ where: { weeklySlotId, startsAt: { gte: deadline } }, select: { id: true } });
  if (slots.length === 0) return;
  const slotIds = slots.map((s) => s.id);
  await tx.lesson.updateMany({ where: { slotId: { in: slotIds } }, data: { canceledAt: null, weeklyLessonId } });
  await tx.lesson.createMany({ data: slotIds.map((slotId) => ({ slotId, weeklyLessonId })) as never, skipDuplicates: true });
}

async function detachLessons(tx: Tx, weeklyLessonId: string, deadline: Date, now: Date) {
  await tx.lesson.updateMany({ where: changeableLessons(weeklyLessonId, deadline), data: { canceledAt: now } });
}

export type WeeklyMode = "once" | "all";

/**
 * SCH-14: 고정 일정 바꾸기. 이력은 고정 일정마다 한 줄 (수업마다 남기지 않는다).
 * "이번만"은 수업 1회 옮기기와 같아서 그 수업에 MOVE를 남긴다
 */
export async function applyWeeklyChange(ctx: StudentCtx, ids: unknown, mode: WeeklyMode, now = new Date()) {
  if (mode !== "once" && mode !== "all") throw new ScheduleError("잘못된 요청이에요");
  try {
    return await ctx.db.$transaction(async (tx) => {
      // 같은 학생이 동시에 두 번 바꾸지 않게 내 학생 행을 잠근다
      await tx.student.update({ where: { id: ctx.studentId }, data: { updatedAt: now } });
      const plan = await computePlan(tx, ids, now);

      if (mode === "once") {
        if (!plan.once) throw new ScheduleError("이번만 옮길 수 있는 수업이 없어요");
        await moveInTx(tx, plan.once.lessonId, plan.once.slotId, now);
        return plan;
      }

      const deadline = deadlineOf(now);
      for (const c of plan.changes) {
        await detachLessons(tx, c.weeklyLessonId, deadline, now);
        await tx.weeklyLesson.update({ where: { id: c.weeklyLessonId }, data: { weeklySlotId: c.to.weeklySlotId } });
        await attachLessons(tx, c.weeklyLessonId, c.to.weeklySlotId, deadline);
        await tx.scheduleChange.create({ data: { weeklyLessonId: c.weeklyLessonId, action: "CHANGE", beforeText: weeklyText(c.from), afterText: weeklyText(c.to) } as never });
      }
      for (const r of plan.removes) {
        await detachLessons(tx, r.weeklyLessonId, deadline, now);
        await tx.weeklyLesson.update({ where: { id: r.weeklyLessonId }, data: { deletedAt: now } });
        await tx.scheduleChange.create({ data: { weeklyLessonId: r.weeklyLessonId, action: "REMOVE", beforeText: weeklyText(r.from) } as never });
      }
      for (const a of plan.adds) {
        const wl = await tx.weeklyLesson.create({ data: { weeklySlotId: a.to.weeklySlotId } as never, select: { id: true } });
        await attachLessons(tx, wl.id, a.to.weeklySlotId, deadline);
        await tx.scheduleChange.create({ data: { weeklyLessonId: wl.id, action: "ADD", afterText: weeklyText(a.to) } as never });
      }
      return plan;
    });
  } catch (e) {
    if (isUniqueError(e)) throw new ScheduleError("다른 곳에서 일정이 바뀌었어요. 다시 해 주세요");
    throw e;
  }
}
