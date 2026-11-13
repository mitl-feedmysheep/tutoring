import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { ScopeError, studentDb, studentDbByTeacher, teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import type { StudentCtx } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { myNote, normalizeNote, NOTE_MAX, notesOf, saveStudentNote, saveTeacherNote } from "./notes";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00 KST
const at = (day: number, minute: number) => kstToUtc(2026, 12, day, minute);
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `tn-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string) {
  return prisma.student.create({
    data: { teacherId, name: "S", birthYear: 1990, gender: "FEMALE", email: `sn-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
}

async function lessonAt(teacherId: string, studentId: string, startsAt: Date) {
  const slot = await prisma.slot.create({ data: { teacherId, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) } });
  return prisma.lesson.create({ data: { teacherId, studentId, slotId: slot.id } });
}

const studentCtx = (teacherId: string, studentId: string): StudentCtx => ({ db: studentDb(teacherId, studentId), teacherId, studentId });

const rawNotes = (lessonId: string) => prisma.lessonNote.findMany({ where: { lessonId }, orderBy: { author: "asc" }, select: { author: true, content: true } });

async function setup() {
  const t = await newTeacher();
  const s = await newStudent(t.id);
  return { t, s, db: teacherDb(t.id), ctx: studentCtx(t.id, s.id) };
}

describe("노트 내용 정리", () => {
  it("내용 없는 글머리 줄과 앞뒤 빈 줄을 빼고 줄바꿈을 맞춘다", () => {
    expect(normalizeNote("- would\r\n- used to  \n- \n-\n")).toBe("- would\n- used to");
    expect(normalizeNote("\n\n- a\n\n- b\n\n")).toBe("- a\n\n- b");
    expect(normalizeNote("- ")).toBe("");
    expect(normalizeNote("")).toBe("");
    expect(normalizeNote("x".repeat(NOTE_MAX))).toHaveLength(NOTE_MAX);
    expect(() => normalizeNote("x".repeat(NOTE_MAX + 1))).toThrow(ScheduleError);
    expect(() => normalizeNote(null)).toThrow(ScheduleError);
  });
});

describe("선생님 노트 (NOTE-01, 05)", () => {
  it("시작한 수업(진행 중 포함)에 쓰고 고치고, 비우면 빈 노트가 된다", async () => {
    const { t, s, db } = await setup();
    const past = await lessonAt(t.id, s.id, at(9, 19 * 60));
    const live = await lessonAt(t.id, s.id, at(10, 11 * 60 + 30)); // 진행 중
    await saveTeacherNote(db, past.id, "- would / used to\n- ", NOW);
    await saveTeacherNote(db, live.id, "- 발음 연습", NOW);
    expect(await rawNotes(past.id)).toEqual([{ author: "TEACHER", content: "- would / used to" }]);

    await saveTeacherNote(db, past.id, "- 고쳤어요", NOW);
    expect(await rawNotes(past.id)).toEqual([{ author: "TEACHER", content: "- 고쳤어요" }]);

    await saveTeacherNote(db, past.id, "- ", NOW);
    expect(await rawNotes(past.id)).toEqual([{ author: "TEACHER", content: "" }]);
    expect((await notesOf(db, [past.id, live.id])).get(live.id)).toEqual({ teacher: "- 발음 연습", student: "" });
  });

  it("없는 노트를 비워서 저장하면 행을 만들지 않는다", async () => {
    const { t, s, db } = await setup();
    const past = await lessonAt(t.id, s.id, at(9, 19 * 60));
    await saveTeacherNote(db, past.id, "- ", NOW);
    expect(await rawNotes(past.id)).toEqual([]);
  });

  it("시작 전·취소·지운 슬롯의 수업과 잘못된 값은 막는다", async () => {
    const { t, s, db } = await setup();
    const future = await lessonAt(t.id, s.id, at(10, 12 * 60 + 1));
    await err(saveTeacherNote(db, future.id, "x", NOW), "수업이 시작한 뒤에 노트를 쓸 수 있어요");

    const canceled = await lessonAt(t.id, s.id, at(9, 19 * 60));
    await prisma.lesson.update({ where: { id: canceled.id }, data: { canceledAt: NOW } });
    await err(saveTeacherNote(db, canceled.id, "x", NOW), "없는 수업이에요");

    const deletedSlot = await lessonAt(t.id, s.id, at(8, 19 * 60));
    await prisma.slot.update({ where: { id: deletedSlot.slotId }, data: { deletedAt: NOW } });
    await err(saveTeacherNote(db, deletedSlot.id, "x", NOW), "없는 수업이에요");

    const past = await lessonAt(t.id, s.id, at(7, 19 * 60));
    await err(saveTeacherNote(db, "not-an-id", "x", NOW), "잘못된 요청이에요");
    await err(saveTeacherNote(db, randomUUID(), "x", NOW), "없는 수업이에요");
    await err(saveTeacherNote(db, past.id, 123, NOW), "잘못된 요청이에요");
    await err(saveTeacherNote(db, past.id, "x".repeat(NOTE_MAX + 1), NOW), `노트는 ${NOTE_MAX.toLocaleString()}자까지 쓸 수 있어요`);
    for (const l of [future, canceled, deletedSlot, past]) expect(await rawNotes(l.id)).toEqual([]);
  });

  it("다른 선생님 학생의 수업에는 쓰지도 읽지도 못한다", async () => {
    const a = await setup();
    const b = await setup();
    const lesson = await lessonAt(b.t.id, b.s.id, at(9, 19 * 60));
    await saveStudentNote(b.ctx, lesson.id, "- B 학생 노트", NOW);
    await saveTeacherNote(b.db, lesson.id, "- B 선생님 노트", NOW);

    await err(saveTeacherNote(a.db, lesson.id, "hack", NOW), "없는 수업이에요");
    expect((await notesOf(a.db, [lesson.id])).get(lesson.id)).toEqual({ teacher: "", student: "" });
    expect(await rawNotes(lesson.id)).toEqual([
      { author: "TEACHER", content: "- B 선생님 노트" },
      { author: "STUDENT", content: "- B 학생 노트" },
    ]);
  });
});

describe("학생 노트 (NOTE-02, APP-10)", () => {
  it("시작한 내 수업에 쓰고 고친다. 선생님은 두 노트를 다 보고, 학생은 선생님 노트를 못 본다", async () => {
    const { t, s, db, ctx } = await setup();
    const past = await lessonAt(t.id, s.id, at(1, 19 * 60));
    await saveTeacherNote(db, past.id, "- 선생님만", NOW);
    await saveStudentNote(ctx, past.id, "- 내 노트\n- ", NOW);
    await saveStudentNote(ctx, past.id, "- 내 노트\n- 고침", NOW);

    expect(await myNote(ctx, past.id)).toBe("- 내 노트\n- 고침");
    expect((await notesOf(db, [past.id])).get(past.id)).toEqual({ teacher: "- 선생님만", student: "- 내 노트\n- 고침" });
    // 학생 범위에서 선생님 노트를 직접 찾아도 안 보인다
    expect(await ctx.db.lessonNote.findMany({ where: { lessonId: past.id, author: "TEACHER" } })).toEqual([]);
  });

  it("시작 전·취소한 수업과 다른 학생 수업에는 못 쓴다", async () => {
    const { t, s, ctx } = await setup();
    const other = await newStudent(t.id);
    const future = await lessonAt(t.id, s.id, at(10, 13 * 60));
    await err(saveStudentNote(ctx, future.id, "x", NOW), "수업이 시작한 뒤에 노트를 쓸 수 있어요");

    const canceled = await lessonAt(t.id, s.id, at(9, 19 * 60));
    await prisma.lesson.update({ where: { id: canceled.id }, data: { canceledAt: NOW } });
    await err(saveStudentNote(ctx, canceled.id, "x", NOW), "없는 수업이에요");

    const othersLesson = await lessonAt(t.id, other.id, at(8, 19 * 60));
    await err(saveStudentNote(ctx, othersLesson.id, "hack", NOW), "없는 수업이에요");
    for (const l of [future, canceled, othersLesson]) expect(await rawNotes(l.id)).toEqual([]);
  });

  it("선생님 노트를 쓴 뒤에도 학생 노트는 따로 만들어지고, 선생님 노트는 그대로다", async () => {
    const { t, s, db, ctx } = await setup();
    const past = await lessonAt(t.id, s.id, at(9, 19 * 60));
    await saveTeacherNote(db, past.id, "- T", NOW);
    await saveStudentNote(ctx, past.id, "- S", NOW);
    await saveStudentNote(ctx, past.id, "", NOW);
    expect(await rawNotes(past.id)).toEqual([
      { author: "TEACHER", content: "- T" },
      { author: "STUDENT", content: "" },
    ]);
  });

  it("선생님이 학생 일정을 대신 바꾸는 범위로는 학생 노트를 쓸 수 없다", async () => {
    const { t, s } = await setup();
    const past = await lessonAt(t.id, s.id, at(9, 19 * 60));
    const ctx: StudentCtx = { db: studentDbByTeacher(t.id, s.id), teacherId: t.id, studentId: s.id, byTeacher: true };
    await expect(saveStudentNote(ctx, past.id, "- 위조", NOW)).rejects.toBeInstanceOf(ScopeError);
    expect(await rawNotes(past.id)).toEqual([]);
  });
});
