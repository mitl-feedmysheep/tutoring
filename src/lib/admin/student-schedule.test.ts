import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { ScopeError, studentDbByTeacher, teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import { bookableSlots, bookSlot, cancelLesson, lessonDetail, moveLesson, upcomingLessons } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { applyWeeklyChange } from "@/lib/schedule/weekly";
import { scheduleHistory, studentProfile, teacherStudentCtx } from "./student-schedule";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00 KST
const at = (day: number, minute: number) => kstToUtc(2026, 12, day, minute);
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));
const REASON = "선생님 사정으로 옮겨요";

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `ts-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string) {
  return prisma.student.create({
    data: { teacherId, name: "S", birthYear: 1990, gender: "MALE", email: `s-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
}

async function newSlot(teacherId: string, startsAt: Date, weeklySlotId?: string) {
  return prisma.slot.create({ data: { teacherId, weeklySlotId, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) } });
}

async function lessonOn(teacherId: string, studentId: string, slotId: string) {
  return prisma.lesson.create({ data: { teacherId, studentId, slotId } });
}

/** 선생님 세션으로 그 학생 ctx (사유 포함) */
async function setup(reason: string | undefined = REASON) {
  const t = await newTeacher();
  const s = await newStudent(t.id);
  const ctx = await teacherStudentCtx(teacherDb(t.id), t.id, s.id, reason);
  return { t, s, ctx };
}

const changes = (studentId: string) =>
  prisma.scheduleChange.findMany({ where: { studentId }, orderBy: { createdAt: "asc" }, select: { action: true, changedBy: true, reason: true, beforeText: true, afterText: true } });

describe("선생님이 학생 수업 바꾸기 (SCH-16)", () => {
  it("1시간 규칙 없이 시작 전 수업을 취소하고, 이력에 선생님과 사유가 남는다", async () => {
    const { t, s, ctx } = await setup();
    const slot = await newSlot(t.id, at(10, 12 * 60 + 30)); // 30분 뒤
    const lesson = await lessonOn(t.id, s.id, slot.id);

    await cancelLesson(ctx, lesson.id, NOW);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).canceledAt).not.toBeNull();
    expect(await changes(s.id)).toEqual([{ action: "CANCEL", changedBy: "TEACHER", reason: REASON, beforeText: "12/10(목) 12:30", afterText: null }]);
  });

  it("시작했거나 지난 수업은 바꿀 수 없다", async () => {
    const { t, s, ctx } = await setup();
    const started = await lessonOn(t.id, s.id, (await newSlot(t.id, at(10, 11 * 60 + 30))).id);
    const now = await lessonOn(t.id, s.id, (await newSlot(t.id, NOW)).id);
    await err(cancelLesson(ctx, started.id, NOW), "이미 시작했거나 지난 수업이라 바꿀 수 없어요");
    await err(cancelLesson(ctx, now.id, NOW), "이미 시작했거나 지난 수업이라 바꿀 수 없어요");
    await err(bookSlot(ctx, (await newSlot(t.id, at(10, 11 * 60))).id, NOW), "이미 시작했거나 지난 수업이라 바꿀 수 없어요");
    expect((await lessonDetail(ctx, started.id, NOW))?.canChange).toBe(false);
  });

  it("사유가 없거나 200자를 넘으면 막는다", async () => {
    const { t, s } = await setup();
    const slot = await newSlot(t.id, at(15, 1140));
    const lesson = await lessonOn(t.id, s.id, slot.id);
    for (const reason of [undefined, "", "   "]) {
      const ctx = await teacherStudentCtx(teacherDb(t.id), t.id, s.id, reason);
      await err(cancelLesson(ctx, lesson.id, NOW), "바꾸는 이유를 적어 주세요");
      await err(applyWeeklyChange(ctx, [], "all", NOW), "바꾸는 이유를 적어 주세요");
    }
    const long = await teacherStudentCtx(teacherDb(t.id), t.id, s.id, "가".repeat(201));
    await err(cancelLesson(long, lesson.id, NOW), "이유는 200자 이하로 써 주세요");
    expect(await changes(s.id)).toEqual([]);
  });

  it("곧 시작하는 슬롯에도 넣고 옮길 수 있다", async () => {
    const { t, s, ctx } = await setup();
    const soon = await newSlot(t.id, at(10, 12 * 60 + 20));
    const later = await newSlot(t.id, at(11, 1140));
    expect((await bookableSlots(ctx, NOW)).map((x) => x.id)).toEqual([soon.id, later.id]);

    const { lessonId } = await bookSlot(ctx, soon.id, NOW);
    await moveLesson(ctx, lessonId, later.id, NOW);
    expect((await upcomingLessons(ctx, NOW)).map((l) => l.slotId)).toEqual([later.id]);
    expect((await changes(s.id)).map((c) => [c.action, c.changedBy, c.reason])).toEqual([
      ["ADD", "TEACHER", REASON],
      ["MOVE", "TEACHER", REASON],
    ]);
  });

  it("고정 일정 앞으로 전부: 1시간 안 수업도 바꾸고 이력은 한 줄", async () => {
    const { t, s, ctx } = await setup();
    const thu = await prisma.weeklySlot.create({ data: { teacherId: t.id, weekday: 4, startMinute: 12 * 60 + 30, endMinute: 13 * 60 + 20 } });
    const fri = await prisma.weeklySlot.create({ data: { teacherId: t.id, weekday: 5, startMinute: 1140, endMinute: 1190 } });
    const thuSlots = [await newSlot(t.id, at(10, 12 * 60 + 30), thu.id), await newSlot(t.id, at(17, 12 * 60 + 30), thu.id)];
    const friSlot = await newSlot(t.id, at(11, 1140), fri.id);
    const wl = await prisma.weeklyLesson.create({ data: { teacherId: t.id, studentId: s.id, weeklySlotId: thu.id } });
    for (const slot of thuSlots) await prisma.lesson.create({ data: { teacherId: t.id, studentId: s.id, slotId: slot.id, weeklyLessonId: wl.id } });

    await applyWeeklyChange(ctx, [fri.id], "all", NOW);
    expect((await upcomingLessons(ctx, NOW)).map((l) => [l.slotId, l.fixed])).toEqual([[friSlot.id, true]]);
    expect(await changes(s.id)).toEqual([{ action: "CHANGE", changedBy: "TEACHER", reason: REASON, beforeText: "매주 목 12:30~13:20", afterText: "매주 금 19:00~19:50" }]);
  });
});

describe("선생님이 바꿀 수 있는 학생 (격리)", () => {
  it("다른 선생님 학생, 비활성 학생, 잘못된 id는 막는다", async () => {
    const { t } = await setup();
    const other = await newTeacher();
    const theirs = await newStudent(other.id);
    const inactive = await prisma.student.create({
      data: { teacherId: t.id, name: "I", birthYear: 1990, gender: "MALE", email: `i-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x", deactivatedAt: NOW },
    });
    for (const id of [theirs.id, inactive.id, "nope", undefined]) {
      await err(teacherStudentCtx(teacherDb(t.id), t.id, id, REASON), "없는 학생이에요");
    }
    expect(await studentProfile(teacherDb(t.id), theirs.id)).toBeNull();
  });

  it("다른 학생 수업, 다른 선생님 슬롯은 건드리지 못한다", async () => {
    const { t, ctx } = await setup();
    const b = await newStudent(t.id);
    const bLesson = await lessonOn(t.id, b.id, (await newSlot(t.id, at(15, 1140))).id);
    await err(cancelLesson(ctx, bLesson.id, NOW), "없는 수업이에요");

    const other = await newTeacher();
    const theirSlot = await newSlot(other.id, at(15, 1140));
    await err(bookSlot(ctx, theirSlot.id, NOW), "없어진 수업 시간이에요. 목록을 새로 고쳐 주세요");
    expect(await prisma.lesson.count({ where: { slotId: theirSlot.id } })).toBe(0);
  });

  it("대신 바꾸는 범위로는 노트·게시판을 못 쓰고, 이력의 작성자를 학생으로 바꿀 수 없다", async () => {
    const { t, s } = await setup();
    const db = studentDbByTeacher(t.id, s.id);
    const lesson = await lessonOn(t.id, s.id, (await newSlot(t.id, at(15, 1140))).id);
    await expect(db.lessonNote.create({ data: { lessonId: lesson.id, content: "x" } as never })).rejects.toThrow(ScopeError);
    await expect(db.board.create({ data: { title: "x", content: "x" } as never })).rejects.toThrow(ScopeError);
    await expect(db.scheduleChange.create({ data: { lessonId: lesson.id, action: "CANCEL", changedBy: "STUDENT" } as never })).rejects.toThrow(ScopeError);
  });

  it("변경 이력은 그 학생 것만, 내 학생 것만 보인다 (SCH-17)", async () => {
    const { t, s, ctx } = await setup();
    const b = await newStudent(t.id);
    const slot = await newSlot(t.id, at(15, 1140));
    await bookSlot(ctx, slot.id, NOW);
    await bookSlot(await teacherStudentCtx(teacherDb(t.id), t.id, b.id, REASON), slot.id, NOW);

    expect((await scheduleHistory(teacherDb(t.id), s.id)).map((h) => [h.action, h.changedBy, h.reason])).toEqual([["ADD", "TEACHER", REASON]]);
    const other = await newTeacher();
    expect(await scheduleHistory(teacherDb(other.id), s.id)).toEqual([]);
  });
});
