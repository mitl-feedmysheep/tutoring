import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { teacherDb } from "@/lib/db/scope";
import { generateMonth, isMonthGenerated } from "./generate";
import { runMonthlyGenerationFor } from "./job";
import { isLastDayOfMonth, kstParts, kstToUtc, parseTime, weeklyOccurrences } from "./kst";
import {
  createOneOffSlot,
  createWeeklySlot,
  deleteSlot,
  deleteWeeklySlot,
  listMonthSlots,
  listWeeklySlots,
  ScheduleError,
  updateWeeklySlot,
} from "./teacher";

afterAll(() => prisma.$disconnect());

// 2026-12: 1일이 화요일. 화요일 = 1, 8, 15, 22, 29
const DEC = { year: 2026, month: 12 };
const JAN = { year: 2027, month: 1 }; // 화요일 = 5, 12, 19, 26
const MID_DEC = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00 KST
const LAST_DEC = kstToUtc(2026, 12, 31, 30); // 12/31 00:30 KST
const TUE_19 = { weekday: 2, startMinute: 19 * 60, endMinute: 20 * 60 };

async function newTeacher() {
  const t = await prisma.teacher.create({ data: { name: "T", email: `sch-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
  return { id: t.id, db: teacherDb(t.id) };
}

async function newStudent(teacherId: string) {
  return prisma.student.create({
    data: { teacherId, name: `S-${randomUUID().slice(0, 4)}`, birthYear: 1990, gender: "MALE", email: `s-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
}

const kstDays = (slots: { startsAt: Date }[]) => slots.map((s) => kstParts(s.startsAt).day);

describe("KST 날짜", () => {
  it("KST 벽시계와 UTC를 오간다", () => {
    const d = kstToUtc(2026, 12, 1, 19 * 60);
    expect(d.toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(kstParts(d)).toMatchObject({ year: 2026, month: 12, day: 1, weekday: 2, minute: 1140 });
    // UTC로는 전날이지만 KST로는 다음 날 새벽
    expect(kstParts(new Date("2026-11-30T16:00:00Z"))).toMatchObject({ month: 12, day: 1 });
  });

  it("마지막 날은 KST 기준이다", () => {
    expect(isLastDayOfMonth(LAST_DEC)).toBe(true);
    expect(isLastDayOfMonth(new Date("2026-12-31T15:00:00Z"))).toBe(false); // KST 1/1 00:00
    expect(isLastDayOfMonth(kstToUtc(2027, 2, 28))).toBe(true);
  });

  it("고정 시간 요일의 날짜를 지금 이후로만 고른다", () => {
    expect(kstDays(weeklyOccurrences(TUE_19, DEC, MID_DEC))).toEqual([15, 22, 29]);
    expect(kstDays(weeklyOccurrences(TUE_19, JAN, MID_DEC))).toEqual([5, 12, 19, 26]);
  });

  it("시간 입력을 분으로 바꾼다", () => {
    expect(parseTime("19:00")).toBe(1140);
    expect(parseTime("24:00")).toBe(1440);
    expect(parseTime("19:60")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});

describe("고정 수업 시간 (SCH-11, SCH-15)", () => {
  it("등록하면 이번 달 남은 날짜만 바로 만든다 (다음 달은 아직)", async () => {
    const { db } = await newTeacher();
    await createWeeklySlot(db, TUE_19, MID_DEC);
    expect(kstDays(await listMonthSlots(db, DEC))).toEqual([15, 22, 29]);
    expect(await listMonthSlots(db, JAN)).toHaveLength(0);
  });

  it("월말 생성이 끝난 뒤 등록하면 다음 달까지 만든다", async () => {
    const { db } = await newTeacher();
    await generateMonth(db, JAN, LAST_DEC);
    await createWeeklySlot(db, TUE_19, LAST_DEC);
    expect(kstDays(await listMonthSlots(db, JAN))).toEqual([5, 12, 19, 26]);
  });

  it("같은 요일에 겹치는 시간과 잘못된 시간은 막는다", async () => {
    const { db } = await newTeacher();
    await createWeeklySlot(db, TUE_19, MID_DEC);
    await expect(createWeeklySlot(db, { weekday: 2, startMinute: 19 * 60 + 30, endMinute: 21 * 60 }, MID_DEC)).rejects.toThrow("겹치는");
    await expect(createWeeklySlot(db, { weekday: 2, startMinute: 20 * 60, endMinute: 19 * 60 }, MID_DEC)).rejects.toBeInstanceOf(ScheduleError);
    await expect(createWeeklySlot(db, { weekday: 7, startMinute: 600, endMinute: 660 }, MID_DEC)).rejects.toBeInstanceOf(ScheduleError);
    // 바로 이어지는 시간은 된다
    await createWeeklySlot(db, { weekday: 2, startMinute: 20 * 60, endMinute: 21 * 60 }, MID_DEC);
  });

  it("학생이 없으면 바꾸는 즉시 반영한다. 예약이 있는 슬롯은 그대로 둔다", async () => {
    const { id, db } = await newTeacher();
    const s = await newStudent(id);
    const w = await createWeeklySlot(db, TUE_19, MID_DEC);
    const [booked] = await listMonthSlots(db, DEC);
    await db.lesson.create({ data: { slotId: booked.id, studentId: s.id } as never }); // 1회 예약

    const res = await updateWeeklySlot(db, w.id, { weekday: 2, startMinute: 18 * 60, endMinute: 19 * 60 }, undefined, MID_DEC);
    expect(res).toEqual({ applied: "now" });

    const slots = await listMonthSlots(db, DEC);
    const times = slots.map((x) => `${kstParts(x.startsAt).day} ${kstParts(x.startsAt).minute / 60}`);
    expect(times).toEqual(["15 18", "15 19", "22 18", "29 18"]);
    expect(slots.find((x) => x.id === booked.id)?.students).toHaveLength(1);
    expect((await listWeeklySlots(db)).map((x) => x.startMinute)).toEqual([18 * 60]);
  });

  it("학생 고정 일정이 있으면 사유가 필요하고, 이미 만든 달은 그대로 두고 이력을 남긴다", async () => {
    const { id, db } = await newTeacher();
    const s = await newStudent(id);
    const w = await createWeeklySlot(db, TUE_19, MID_DEC);
    const wl = await db.weeklyLesson.create({ data: { studentId: s.id, weeklySlotId: w.id } as never });

    const to = { weekday: 4, startMinute: 19 * 60, endMinute: 20 * 60 };
    await expect(updateWeeklySlot(db, w.id, to, "  ", MID_DEC)).rejects.toThrow("이유");
    const res = await updateWeeklySlot(db, w.id, to, "학원 일정", MID_DEC);
    expect(res).toEqual({ applied: "later", fromMonth: JAN, students: 1 });

    // 12월 화요일 슬롯은 그대로
    expect(kstDays(await listMonthSlots(db, DEC))).toEqual([15, 22, 29]);
    // 다음 달은 새 요일(목: 7, 14, 21, 28)로 만들어지고, 학생 수업도 같이 생긴다
    await generateMonth(db, JAN, LAST_DEC);
    const jan = await listMonthSlots(db, JAN);
    expect(kstDays(jan)).toEqual([7, 14, 21, 28]);
    expect(jan.every((x) => x.students.length === 1 && x.students[0].fixed)).toBe(true);

    const log = await db.scheduleChange.findMany({ where: { weeklyLessonId: wl.id } });
    expect(log).toMatchObject([
      { action: "CHANGE", beforeText: "매주 화 19:00~20:00", afterText: "매주 목 19:00~20:00", changedBy: "TEACHER", reason: "학원 일정" },
    ]);
  });

  it("학생이 없으면 지울 때 앞으로의 빈 슬롯도 지운다", async () => {
    const { db } = await newTeacher();
    const w = await createWeeklySlot(db, TUE_19, MID_DEC);
    expect(await deleteWeeklySlot(db, w.id, MID_DEC)).toEqual({ applied: "now" });
    expect(await listMonthSlots(db, DEC)).toHaveLength(0);
    expect(await listWeeklySlots(db)).toHaveLength(0);
  });

  it("학생이 있으면 이번 달은 두고, 월말 생성 때 학생 고정 일정이 끝난다", async () => {
    const { id, db } = await newTeacher();
    const s = await newStudent(id);
    const w = await createWeeklySlot(db, TUE_19, MID_DEC);
    const wl = await db.weeklyLesson.create({ data: { studentId: s.id, weeklySlotId: w.id } as never });

    expect(await deleteWeeklySlot(db, w.id, MID_DEC)).toEqual({ applied: "later", fromMonth: JAN, students: 1 });
    expect(await listMonthSlots(db, DEC)).toHaveLength(3);

    const res = await generateMonth(db, JAN, LAST_DEC);
    expect(res?.endedWeeklyLessons).toEqual([{ id: wl.id, studentId: s.id }]);
    expect(await listMonthSlots(db, JAN)).toHaveLength(0);
    expect(await db.weeklyLesson.count()).toBe(0);
    expect(await db.scheduleChange.findMany({ where: { weeklyLessonId: wl.id } })).toMatchObject([
      { action: "REMOVE", beforeText: "매주 화 19:00~20:00", changedBy: "SYSTEM" },
    ]);
  });
});

describe("월 단위 일괄 생성 (SCH-11)", () => {
  it("슬롯과 학생 고정 일정 수업을 만들고, 두 번 돌려도 한 번만 만든다", async () => {
    const { id, db } = await newTeacher();
    const s = await newStudent(id);
    const w = await createWeeklySlot(db, TUE_19, MID_DEC);
    await db.weeklyLesson.create({ data: { studentId: s.id, weeklySlotId: w.id } as never });

    expect(await generateMonth(db, JAN, LAST_DEC)).not.toBeNull();
    expect(await generateMonth(db, JAN, LAST_DEC)).toBeNull();
    const jan = await listMonthSlots(db, JAN);
    expect(kstDays(jan)).toEqual([5, 12, 19, 26]);
    expect(jan.map((x) => x.students.length)).toEqual([1, 1, 1, 1]);
  });

  it("비활성 학생의 고정 일정은 수업을 만들지 않는다", async () => {
    const { id, db } = await newTeacher();
    const s = await newStudent(id);
    const w = await createWeeklySlot(db, TUE_19, MID_DEC);
    await db.weeklyLesson.create({ data: { studentId: s.id, weeklySlotId: w.id } as never });
    await prisma.student.update({ where: { id: s.id }, data: { deactivatedAt: MID_DEC } });

    await generateMonth(db, JAN, LAST_DEC);
    expect((await listMonthSlots(db, JAN)).map((x) => x.students.length)).toEqual([0, 0, 0, 0]);
  });

  it("스케줄러: 마지막 날에만 다음 달을 만들고, 놓쳤으면 다음 달 초에 따라잡는다", async () => {
    const { db } = await newTeacher();
    await createWeeklySlot(db, TUE_19, MID_DEC);

    await runMonthlyGenerationFor(db, MID_DEC);
    expect(await isMonthGenerated(db, JAN)).toBe(false);

    await runMonthlyGenerationFor(db, LAST_DEC);
    expect(await isMonthGenerated(db, JAN)).toBe(true);
    expect(await listMonthSlots(db, JAN)).toHaveLength(4);

    // 1월 마지막 날을 놓치고 2/3에 돌아도 2월을 만든다 (2/3 이후 화요일: 9, 16, 23)
    await runMonthlyGenerationFor(db, kstToUtc(2027, 2, 3, 9 * 60));
    expect(await isMonthGenerated(db, { year: 2027, month: 2 })).toBe(true);
    expect(kstDays(await listMonthSlots(db, { year: 2027, month: 2 }))).toEqual([9, 16, 23]);
  });

  it("선생님이 지운 날은 월 생성을 다시 해도 생기지 않는다", async () => {
    const { db } = await newTeacher();
    await generateMonth(db, JAN, LAST_DEC);
    await createWeeklySlot(db, TUE_19, LAST_DEC);
    const [first] = await listMonthSlots(db, JAN);
    await deleteSlot(db, first.id, LAST_DEC);
    // 월 기록을 지우고 다시 만들어도 (UNIQUE에 걸려) 지운 날은 다시 생기지 않는다
    await prisma.monthlySlotHistory.deleteMany({ where: { teacherId: (await db.teacher.findFirstOrThrow()).id } });
    await generateMonth(db, JAN, LAST_DEC);
    expect(kstDays(await listMonthSlots(db, JAN))).toEqual([12, 19, 26]);
  });
});

describe("1회성 슬롯과 슬롯 삭제 (SCH-01, SCH-10, SCH-12)", () => {
  const day = { year: 2026, month: 12, day: 17 };

  it("1회성 슬롯을 만든다. 지난 시간과 겹치는 시간은 막는다", async () => {
    const { db } = await newTeacher();
    const slot = await createOneOffSlot(db, { ...day, startMinute: 10 * 60, endMinute: 11 * 60 }, MID_DEC);
    expect(slot.weeklySlotId).toBeNull();
    await expect(createOneOffSlot(db, { ...day, startMinute: 10 * 60 + 30, endMinute: 12 * 60 }, MID_DEC)).rejects.toThrow("이미");
    await expect(createOneOffSlot(db, { year: 2026, month: 12, day: 9, startMinute: 600, endMinute: 660 }, MID_DEC)).rejects.toThrow("지난");
    await createOneOffSlot(db, { ...day, startMinute: 11 * 60, endMinute: 12 * 60 }, MID_DEC);
    expect(await listMonthSlots(db, DEC)).toHaveLength(2);
  });

  it("슬롯을 지우면 예약된 수업도 지워지고, 예약했던 학생을 돌려준다. 지난 슬롯은 못 지운다", async () => {
    const { id, db } = await newTeacher();
    const s = await newStudent(id);
    const slot = await createOneOffSlot(db, { ...day, startMinute: 600, endMinute: 660 }, MID_DEC);
    await db.lesson.create({ data: { slotId: slot.id, studentId: s.id } as never });

    await expect(deleteSlot(db, slot.id, kstToUtc(2026, 12, 17, 600))).rejects.toThrow("지난");
    expect(await deleteSlot(db, slot.id, MID_DEC)).toEqual({ studentIds: [s.id] });
    expect(await listMonthSlots(db, DEC)).toHaveLength(0);
    expect(await db.lesson.count({ where: { slotId: slot.id } })).toBe(0);
  });
});

describe("선생님 간 격리", () => {
  it("다른 선생님의 고정 시간·슬롯은 보이지 않고, 바꾸거나 지울 수 없다", async () => {
    const a = await newTeacher();
    const b = await newTeacher();
    const w = await createWeeklySlot(a.db, TUE_19, MID_DEC);
    const [slot] = await listMonthSlots(a.db, DEC);

    expect(await listWeeklySlots(b.db)).toHaveLength(0);
    expect(await listMonthSlots(b.db, DEC)).toHaveLength(0);
    await expect(updateWeeklySlot(b.db, w.id, { ...TUE_19, startMinute: 18 * 60 }, "x", MID_DEC)).rejects.toThrow("없는");
    await expect(deleteWeeklySlot(b.db, w.id, MID_DEC)).rejects.toThrow("없는");
    await expect(deleteSlot(b.db, slot.id, MID_DEC)).rejects.toThrow("없는");

    // B가 같은 시간에 만들어도 A와 겹친다고 막히지 않는다
    await createWeeklySlot(b.db, TUE_19, MID_DEC);
    await createOneOffSlot(b.db, { year: 2026, month: 12, day: 15, startMinute: 19 * 60, endMinute: 20 * 60 }, MID_DEC).catch((e) => {
      expect(e.message).toContain("이미"); // B 자신의 고정 슬롯과 겹침
    });
    expect(await listWeeklySlots(a.db)).toHaveLength(1);
    expect(await listMonthSlots(a.db, DEC)).toHaveLength(3);
  });

  it("월 생성은 그 선생님 것만 만든다", async () => {
    const a = await newTeacher();
    const b = await newTeacher();
    await createWeeklySlot(a.db, TUE_19, MID_DEC);
    await generateMonth(b.db, JAN, LAST_DEC);
    expect(await isMonthGenerated(a.db, JAN)).toBe(false);
    expect(await listMonthSlots(b.db, JAN)).toHaveLength(0);
    expect(await prisma.slot.count({ where: { teacherId: b.id } })).toBe(0);
  });
});
