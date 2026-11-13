import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { studentDb } from "@/lib/db/scope";
import { kstToUtc } from "./kst";
import {
  bookableSlots,
  bookSlot,
  cancelLesson,
  lessonDetail,
  monthLessons,
  moveLesson,
  myWeeklySchedule,
  nextLesson,
  pastLessons,
  upcomingLessons,
  type StudentCtx,
} from "./student";
import { ScheduleError } from "./teacher";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00 KST
const at = (day: number, hour: number, minute = 0) => kstToUtc(2026, 12, day, hour * 60 + minute);

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `stu-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string): Promise<StudentCtx & { name: string }> {
  const s = await prisma.student.create({
    data: { teacherId, name: `S-${randomUUID().slice(0, 4)}`, birthYear: 1990, gender: "FEMALE", email: `s-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
  return { db: studentDb(teacherId, s.id), teacherId, studentId: s.id, name: s.name };
}

async function newSlot(teacherId: string, startsAt: Date, weeklySlotId?: string) {
  return prisma.slot.create({ data: { teacherId, weeklySlotId, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) } });
}

async function setup() {
  const t = await newTeacher();
  const a = await newStudent(t.id);
  const b = await newStudent(t.id);
  return { t, a, b };
}

const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

describe("예약 (SCH-03, SCH-13)", () => {
  it("앞으로의 슬롯을 예약하고 이력을 남긴다", async () => {
    const { t, a, b } = await setup();
    const slot = await newSlot(t.id, at(12, 10));
    await bookSlot(b, slot.id, NOW);

    const { lessonId } = await bookSlot(a, slot.id, NOW);
    const list = await bookableSlots(a, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: slot.id, participants: 2, mine: { lessonId, fixed: false } });

    const history = await prisma.scheduleChange.findMany({ where: { lessonId } });
    expect(history).toMatchObject([{ action: "ADD", afterText: "12/12(토) 10:00", changedBy: "STUDENT", studentId: a.studentId }]);
  });

  it("수업 시작 1시간 전까지만 예약할 수 있고, 지난 슬롯은 목록에 없다", async () => {
    const { t, a } = await setup();
    const exact = await newSlot(t.id, at(10, 13)); // 딱 1시간 전
    const late = await newSlot(t.id, at(10, 12, 55));
    await newSlot(t.id, at(9, 19)); // 지난 슬롯

    expect((await bookableSlots(a, NOW)).map((s) => s.id)).toEqual([exact.id]);
    await bookSlot(a, exact.id, NOW);
    await err(bookSlot(a, late.id, NOW), "수업 시작 1시간 전까지만 예약할 수 있어요");
  });

  it("같은 수업을 두 번 예약할 수 없다", async () => {
    const { t, a } = await setup();
    const slot = await newSlot(t.id, at(12, 10));
    await bookSlot(a, slot.id, NOW);
    await err(bookSlot(a, slot.id, NOW), "이미 예약한 수업이에요");
  });

  it("지워진 슬롯은 예약할 수 없다", async () => {
    const { t, a } = await setup();
    const slot = await newSlot(t.id, at(12, 10));
    await prisma.slot.update({ where: { id: slot.id }, data: { deletedAt: NOW } });
    expect(await bookableSlots(a, NOW)).toHaveLength(0);
    await err(bookSlot(a, slot.id, NOW), "없어진 수업 시간이에요. 목록을 새로 고쳐 주세요");
  });
});

describe("취소 (SCH-05, SCH-08)", () => {
  it("취소하면 목록에서 빠지고, 다시 예약하면 같은 수업이 되살아난다", async () => {
    const { t, a } = await setup();
    const slot = await newSlot(t.id, at(12, 10));
    const { lessonId } = await bookSlot(a, slot.id, NOW);

    await cancelLesson(a, lessonId, NOW);
    expect(await upcomingLessons(a, NOW)).toHaveLength(0);
    expect((await bookableSlots(a, NOW))[0]).toMatchObject({ participants: 0, mine: null });
    expect(await lessonDetail(a, lessonId, NOW)).toMatchObject({ canceled: true, canChange: false });
    await err(cancelLesson(a, lessonId, NOW), "이미 취소한 수업이에요");

    expect(await bookSlot(a, slot.id, NOW)).toEqual({ lessonId });
    const actions = await prisma.scheduleChange.findMany({ where: { lessonId }, orderBy: { createdAt: "asc" } });
    expect(actions.map((c) => c.action)).toEqual(["ADD", "CANCEL", "ADD"]);
  });

  it("1시간 전이 지나면 취소할 수 없다", async () => {
    const { t, a } = await setup();
    const slot = await newSlot(t.id, at(10, 12, 59));
    const lesson = await prisma.lesson.create({ data: { teacherId: t.id, slotId: slot.id, studentId: a.studentId } });
    expect(await lessonDetail(a, lesson.id, NOW)).toMatchObject({ canChange: false, past: false });
    await err(cancelLesson(a, lesson.id, NOW), "수업 시작 1시간 전이 지나서 바꿀 수 없어요");
  });
});

describe("옮기기 (SCH-05)", () => {
  it("고정 수업을 다른 슬롯으로 옮기면 원래 수업은 취소되고 새 시간은 예약이 된다", async () => {
    const { t, a } = await setup();
    const w = await prisma.weeklySlot.create({ data: { teacherId: t.id, weekday: 2, startMinute: 1140, endMinute: 1190 } });
    const wl = await prisma.weeklyLesson.create({ data: { teacherId: t.id, studentId: a.studentId, weeklySlotId: w.id } });
    const fixedSlot = await newSlot(t.id, at(15, 19), w.id);
    const target = await newSlot(t.id, at(16, 20));
    const fixed = await prisma.lesson.create({ data: { teacherId: t.id, slotId: fixedSlot.id, studentId: a.studentId, weeklyLessonId: wl.id } });

    const { lessonId } = await moveLesson(a, fixed.id, target.id, NOW);
    const upcoming = await upcomingLessons(a, NOW);
    expect(upcoming).toMatchObject([{ id: lessonId, slotId: target.id, fixed: false }]);
    expect(await lessonDetail(a, fixed.id, NOW)).toMatchObject({ canceled: true });

    const history = await prisma.scheduleChange.findMany({ where: { lessonId: fixed.id } });
    expect(history).toMatchObject([{ action: "MOVE", beforeText: "12/15(화) 19:00", afterText: "12/16(수) 20:00" }]);
  });

  it("같은 시간, 이미 예약한 시간, 마감 지난 시간으로는 옮길 수 없고 원래 수업은 그대로다", async () => {
    const { t, a } = await setup();
    const s1 = await newSlot(t.id, at(12, 10));
    const s2 = await newSlot(t.id, at(13, 10));
    const soon = await newSlot(t.id, at(10, 12, 30));
    const { lessonId } = await bookSlot(a, s1.id, NOW);
    await bookSlot(a, s2.id, NOW);

    await err(moveLesson(a, lessonId, s1.id, NOW), "지금 수업과 같은 시간이에요");
    await err(moveLesson(a, lessonId, s2.id, NOW), "이미 예약한 수업이에요");
    await err(moveLesson(a, lessonId, soon.id, NOW), "수업 시작 1시간 전까지만 예약할 수 있어요");
    expect(await lessonDetail(a, lessonId, NOW)).toMatchObject({ canceled: false });
  });
});

describe("내 수업 보기 (APP-02)", () => {
  it("다음 수업, 예정·지난 수업, 달력, 고정 일정", async () => {
    const { t, a, b } = await setup();
    const past = await newSlot(t.id, at(8, 19));
    const ongoing = await newSlot(t.id, at(10, 11, 30)); // 12:20에 끝남
    const later = await newSlot(t.id, at(20, 19));
    const jan = await prisma.slot.create({ data: { teacherId: t.id, startsAt: kstToUtc(2027, 1, 5, 1140), endsAt: kstToUtc(2027, 1, 5, 1190) } });
    for (const s of [past, ongoing, later, jan]) await prisma.lesson.create({ data: { teacherId: t.id, slotId: s.id, studentId: a.studentId } });
    await prisma.lesson.create({ data: { teacherId: t.id, slotId: ongoing.id, studentId: b.studentId } });

    expect(await nextLesson(a, NOW)).toMatchObject({ slotId: ongoing.id, participants: 2 });
    expect((await upcomingLessons(a, NOW)).map((l) => l.slotId)).toEqual([ongoing.id, later.id, jan.id]);
    expect((await pastLessons(a, NOW)).map((l) => l.slotId)).toEqual([past.id]);
    expect((await monthLessons(a, { year: 2026, month: 12 })).map((l) => l.slotId)).toEqual([past.id, ongoing.id, later.id]);

    const w = await prisma.weeklySlot.create({ data: { teacherId: t.id, weekday: 4, startMinute: 1140, endMinute: 1190 } });
    const w2 = await prisma.weeklySlot.create({ data: { teacherId: t.id, weekday: 2, startMinute: 1140, endMinute: 1190 } });
    await prisma.weeklyLesson.create({ data: { teacherId: t.id, studentId: a.studentId, weeklySlotId: w.id } });
    await prisma.weeklyLesson.create({ data: { teacherId: t.id, studentId: a.studentId, weeklySlotId: w2.id } });
    await prisma.weeklyLesson.create({ data: { teacherId: t.id, studentId: b.studentId, weeklySlotId: w.id } });
    expect((await myWeeklySchedule(a)).map((x) => x.weekday)).toEqual([2, 4]);
  });
});

describe("격리", () => {
  it("다른 학생의 수업은 보거나 취소·옮길 수 없다", async () => {
    const { t, a, b } = await setup();
    const s1 = await newSlot(t.id, at(12, 10));
    const s2 = await newSlot(t.id, at(13, 10));
    const { lessonId } = await bookSlot(a, s1.id, NOW);

    expect(await lessonDetail(b, lessonId, NOW)).toBeNull();
    await err(cancelLesson(b, lessonId, NOW), "없는 수업이에요");
    await err(moveLesson(b, lessonId, s2.id, NOW), "없는 수업이에요");
    expect(await upcomingLessons(b, NOW)).toHaveLength(0);
    // 같은 슬롯을 b가 보면 참여 인원만 보이고 내 수업은 아니다
    expect((await bookableSlots(b, NOW))[0]).toMatchObject({ participants: 1, mine: null });
    expect(await lessonDetail(a, lessonId, NOW)).toMatchObject({ canceled: false });
  });

  it("다른 선생님의 슬롯은 목록에 없고 예약·옮기기도 안 된다", async () => {
    const { t, a } = await setup();
    const other = await newTeacher();
    const otherStudent = await newStudent(other.id);
    const mySlot = await newSlot(t.id, at(12, 10));
    const otherSlot = await newSlot(other.id, at(12, 14));
    await bookSlot(otherStudent, otherSlot.id, NOW);

    expect((await bookableSlots(a, NOW)).map((s) => s.id)).toEqual([mySlot.id]);
    await err(bookSlot(a, otherSlot.id, NOW), "없어진 수업 시간이에요. 목록을 새로 고쳐 주세요");
    const { lessonId } = await bookSlot(a, mySlot.id, NOW);
    await err(moveLesson(a, lessonId, otherSlot.id, NOW), "없어진 수업 시간이에요. 목록을 새로 고쳐 주세요");
    expect(await lessonDetail(a, lessonId, NOW)).toMatchObject({ canceled: false, participants: 1 });
    expect(await prisma.lesson.count({ where: { slotId: otherSlot.id } })).toBe(1);
  });
});
