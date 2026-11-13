import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { studentDb } from "@/lib/db/scope";
import { kstToUtc } from "./kst";
import { myWeeklySchedule, upcomingLessons, type StudentCtx } from "./student";
import { ScheduleError } from "./teacher";
import { applyWeeklyChange, planWeeklyChange, weeklyChoices } from "./weekly";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00 KST
const at = (day: number, minute: number) => kstToUtc(2026, 12, day, minute);
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `wk-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string): Promise<StudentCtx> {
  const s = await prisma.student.create({
    data: { teacherId, name: "S", birthYear: 1990, gender: "MALE", email: `s-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
  return { db: studentDb(teacherId, s.id), teacherId, studentId: s.id };
}

/** 고정 시간 + 12월 그 요일 슬롯들 (days) */
async function weekly(teacherId: string, weekday: number, startMinute: number, days: number[]) {
  const w = await prisma.weeklySlot.create({ data: { teacherId, weekday, startMinute, endMinute: startMinute + 50 } });
  const slots = [];
  for (const d of days) {
    slots.push(await prisma.slot.create({ data: { teacherId, weeklySlotId: w.id, startsAt: at(d, startMinute), endsAt: at(d, startMinute + 50) } }));
  }
  return { w, slots };
}

/** 학생 고정 일정 + 그 슬롯들에 고정 수업 */
async function fixed(s: StudentCtx, w: { w: { id: string }; slots: { id: string }[] }) {
  const wl = await prisma.weeklyLesson.create({ data: { teacherId: s.teacherId, studentId: s.studentId, weeklySlotId: w.w.id } });
  for (const slot of w.slots) {
    await prisma.lesson.create({ data: { teacherId: s.teacherId, studentId: s.studentId, slotId: slot.id, weeklyLessonId: wl.id } });
  }
  return wl;
}

const activeOn = async (s: StudentCtx, slotId: string) =>
  prisma.lesson.findFirst({ where: { studentId: s.studentId, slotId, canceledAt: null }, select: { weeklyLessonId: true } });

describe("고정 일정 고르기 (SCH-04)", () => {
  it("처음 고르면 만들어진 앞으로의 슬롯에 고정 수업이 잡힌다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const tue = await weekly(t.id, 2, 1140, [8, 15, 22, 29]); // 12/8은 지난 날

    const plan = await planWeeklyChange(a, [tue.w.id], NOW);
    expect(plan).toMatchObject({ changes: [], removes: [], once: null, adds: [{ firstAt: at(15, 1140) }] });
    await applyWeeklyChange(a, [tue.w.id], "all", NOW);

    expect((await upcomingLessons(a, NOW)).map((l) => [l.slotId, l.fixed])).toEqual(tue.slots.slice(1).map((s) => [s.id, true]));
    expect(await activeOn(a, tue.slots[0].id)).toBeNull();
    expect(await myWeeklySchedule(a)).toMatchObject([{ weekday: 2, startMinute: 1140 }]);
    const history = await prisma.scheduleChange.findMany({ where: { studentId: a.studentId } });
    expect(history).toMatchObject([{ action: "ADD", afterText: "매주 화 19:00~19:50", changedBy: "STUDENT", lessonId: null }]);
  });

  it("바뀐 게 없거나, 지운·다른 선생님 고정 시간은 고를 수 없다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const tue = await weekly(t.id, 2, 1140, [15]);
    const gone = await weekly(t.id, 3, 1140, [16]);
    await prisma.weeklySlot.update({ where: { id: gone.w.id }, data: { deletedAt: NOW } });
    const other = await weekly((await newTeacher()).id, 4, 1140, [17]);

    await err(planWeeklyChange(a, [], NOW), "바뀐 내용이 없어요");
    await err(planWeeklyChange(a, [gone.w.id], NOW), "없어진 고정 시간이 있어요. 화면을 새로 고쳐 주세요");
    await err(applyWeeklyChange(a, [tue.w.id, other.w.id], "all", NOW), "없어진 고정 시간이 있어요. 화면을 새로 고쳐 주세요");
    await err(planWeeklyChange(a, ["not-an-id"], NOW), "잘못된 요청이에요");
    expect(await prisma.lesson.count({ where: { studentId: a.studentId } })).toBe(0);
  });
});

describe("고정 일정 바꾸기 (SCH-14)", () => {
  it("앞으로 전부: 1시간 안 수업은 그대로, 나머지는 새 시간으로. 취소했던·예약했던 수업은 고정 수업이 된다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const thu = await weekly(t.id, 4, 750, [10, 17, 24]); // 목 12:30. 12/10은 30분 뒤라 못 바꾼다
    const wed = await weekly(t.id, 3, 1200, [16, 23, 30]);
    const wl = await fixed(a, thu);
    // 12/16은 전에 예약했다가 취소, 12/23은 예약해 둔 상태
    await prisma.lesson.create({ data: { teacherId: t.id, studentId: a.studentId, slotId: wed.slots[0].id, canceledAt: NOW } });
    await prisma.lesson.create({ data: { teacherId: t.id, studentId: a.studentId, slotId: wed.slots[1].id } });

    const plan = await planWeeklyChange(a, [wed.w.id], NOW);
    expect(plan).toMatchObject({ keptSoon: 1, changes: [{ weeklyLessonId: wl.id, firstAt: at(16, 1200) }], once: { fromAt: at(17, 750), toAt: at(16, 1200) } });
    await applyWeeklyChange(a, [wed.w.id], "all", NOW);

    expect(await activeOn(a, thu.slots[0].id)).toEqual({ weeklyLessonId: wl.id }); // 1시간 안
    expect(await activeOn(a, thu.slots[1].id)).toBeNull();
    expect(await activeOn(a, thu.slots[2].id)).toBeNull();
    for (const s of wed.slots) expect(await activeOn(a, s.id)).toEqual({ weeklyLessonId: wl.id });
    expect(await prisma.weeklyLesson.findUnique({ where: { id: wl.id } })).toMatchObject({ weeklySlotId: wed.w.id, deletedAt: null });

    const history = await prisma.scheduleChange.findMany({ where: { studentId: a.studentId } });
    expect(history).toMatchObject([{ weeklyLessonId: wl.id, action: "CHANGE", beforeText: "매주 목 12:30~13:20", afterText: "매주 수 20:00~20:50" }]);
  });

  it("이번만: 다음 수업 하나만 새 시간의 가장 가까운 수업으로 옮기고 고정 일정은 그대로", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const b = await newStudent(t.id);
    const thu = await weekly(t.id, 4, 1140, [10, 17]);
    const wed = await weekly(t.id, 3, 1200, [9, 16, 23]);
    const wl = await fixed(a, thu);
    // 다른 학생이 12/16에 있어도 a는 그 시간으로 갈 수 있다
    await prisma.lesson.create({ data: { teacherId: t.id, studentId: b.studentId, slotId: wed.slots[1].id } });

    const plan = await planWeeklyChange(a, [wed.w.id], NOW);
    expect(plan.once).toMatchObject({ slotId: wed.slots[1].id, fromAt: at(10, 1140), toAt: at(16, 1200) });
    await applyWeeklyChange(a, [wed.w.id], "once", NOW);

    expect(await activeOn(a, thu.slots[0].id)).toBeNull();
    expect(await activeOn(a, wed.slots[1].id)).toEqual({ weeklyLessonId: null });
    expect(await activeOn(a, thu.slots[1].id)).toEqual({ weeklyLessonId: wl.id });
    expect(await myWeeklySchedule(a)).toMatchObject([{ weekday: 4 }]);
    const history = await prisma.scheduleChange.findMany({ where: { studentId: a.studentId } });
    expect(history).toMatchObject([{ action: "MOVE", beforeText: "12/10(목) 19:00", afterText: "12/16(수) 20:00" }]);
  });

  it("이번만은 1개를 1개로 바꿀 때만, 옮길 곳이 있을 때만 된다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const thu = await weekly(t.id, 4, 1140, [17]);
    const wed = await weekly(t.id, 3, 1200, [16]);
    const sat = await weekly(t.id, 6, 600, []); // 아직 슬롯 없음
    await fixed(a, thu);

    const two = await planWeeklyChange(a, [wed.w.id, sat.w.id], NOW);
    expect(two).toMatchObject({ once: null, adds: [{ firstAt: null }] });
    expect(two.changes).toHaveLength(1);
    await err(applyWeeklyChange(a, [wed.w.id, sat.w.id], "once", NOW), "이번만 옮길 수 있는 수업이 없어요");
    expect((await planWeeklyChange(a, [sat.w.id], NOW)).once).toBeNull();
  });

  it("빼면 앞으로의 고정 수업이 취소되고 고정 일정이 끝난다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const thu = await weekly(t.id, 4, 1140, [17, 24]);
    const wl = await fixed(a, thu);

    expect(await planWeeklyChange(a, [], NOW)).toMatchObject({ removes: [{ weeklyLessonId: wl.id, firstAt: at(17, 1140) }] });
    await applyWeeklyChange(a, [], "all", NOW);
    expect(await upcomingLessons(a, NOW)).toHaveLength(0);
    expect(await myWeeklySchedule(a)).toHaveLength(0);
    expect(await prisma.scheduleChange.findMany({ where: { weeklyLessonId: wl.id } })).toMatchObject([{ action: "REMOVE", beforeText: "매주 목 19:00~19:50" }]);
  });
});

describe("선생님이 바꾸는 중인 고정 시간 안내 (SCH-15)", () => {
  it("시간을 바꿨으면 다음 생성 달부터 새 시간, 지웠으면 다음 달부터 없어진다고 알려 준다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const thu = await weekly(t.id, 4, 1140, [17, 24]);
    const tue = await weekly(t.id, 2, 1140, [15]);
    const free = await weekly(t.id, 1, 600, [14]);
    await fixed(a, thu);
    await fixed(a, tue);
    await prisma.weeklySlot.update({ where: { id: thu.w.id }, data: { startMinute: 1200, endMinute: 1250 } });
    await prisma.weeklySlot.update({ where: { id: tue.w.id }, data: { deletedAt: NOW } });

    const choices = await weeklyChoices(a, NOW);
    expect(choices).toMatchObject([
      { id: free.w.id, mine: false, changing: null, ending: null },
      { id: tue.w.id, mine: true, ending: { year: 2027, month: 1 } },
      { id: thu.w.id, mine: true, startMinute: 1200, changing: { from: { year: 2027, month: 1 }, old: { weekday: 4, startMinute: 1140 } } },
    ]);
    // 지운 시간은 빼기만 된다
    await applyWeeklyChange(a, [thu.w.id], "all", NOW);
    expect((await myWeeklySchedule(a)).map((w) => w.weekday)).toEqual([4]);
  });
});

describe("격리", () => {
  it("다른 학생의 고정 일정·수업은 건드리지 않고, 다른 선생님 고정 시간은 안 보인다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id);
    const b = await newStudent(t.id);
    const thu = await weekly(t.id, 4, 1140, [17]);
    const wed = await weekly(t.id, 3, 1200, [16]);
    const bWl = await fixed(b, thu);
    await fixed(a, thu);
    const otherTeacher = await newTeacher();
    await weekly(otherTeacher.id, 5, 1140, [18]);

    expect((await weeklyChoices(a, NOW)).map((c) => c.id).sort()).toEqual([thu.w.id, wed.w.id].sort());
    await applyWeeklyChange(a, [wed.w.id], "all", NOW);

    expect(await activeOn(b, thu.slots[0].id)).toEqual({ weeklyLessonId: bWl.id });
    expect(await prisma.weeklyLesson.findUnique({ where: { id: bWl.id } })).toMatchObject({ weeklySlotId: thu.w.id, deletedAt: null });
    expect((await weeklyChoices(b, NOW)).find((c) => c.mine)?.id).toBe(thu.w.id);
    expect(await prisma.scheduleChange.count({ where: { studentId: b.studentId } })).toBe(0);
  });
});
