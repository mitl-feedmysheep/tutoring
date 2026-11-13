import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { ScopeError, studentDb, studentDbByTeacher, teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import { bookSlot, cancelLesson, type StudentCtx } from "@/lib/schedule/student";
import { listMonthSlots, ScheduleError } from "@/lib/schedule/teacher";
import { lessonRecords, setAttendance } from "./attendance";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00 KST
const at = (day: number, minute: number) => kstToUtc(2026, 12, day, minute);
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `ta-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string) {
  return prisma.student.create({
    data: { teacherId, name: "S", birthYear: 1990, gender: "FEMALE", email: `sa-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" },
  });
}

async function lessonAt(teacherId: string, studentId: string, startsAt: Date) {
  const slot = await prisma.slot.create({ data: { teacherId, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) } });
  return prisma.lesson.create({ data: { teacherId, studentId, slotId: slot.id } });
}

const attendanceOf = async (id: string) => (await prisma.lesson.findUniqueOrThrow({ where: { id } })).attendance;

async function setup() {
  const t = await newTeacher();
  const s = await newStudent(t.id);
  return { t, s, db: teacherDb(t.id) };
}

describe("완료·결석 체크 (LESSON-01, 03)", () => {
  it("시작한 수업을 완료·결석으로 체크하고, null이면 풀린다", async () => {
    const { t, s, db } = await setup();
    const past = await lessonAt(t.id, s.id, at(9, 19 * 60));
    const started = await lessonAt(t.id, s.id, at(10, 11 * 60 + 30)); // 진행 중
    const now = await lessonAt(t.id, s.id, NOW); // 막 시작

    await setAttendance(db, past.id, "COMPLETED", NOW);
    await setAttendance(db, started.id, "ABSENT", NOW);
    await setAttendance(db, now.id, "COMPLETED", NOW);
    expect([await attendanceOf(past.id), await attendanceOf(started.id), await attendanceOf(now.id)]).toEqual(["COMPLETED", "ABSENT", "COMPLETED"]);

    await setAttendance(db, past.id, "ABSENT", NOW);
    expect(await attendanceOf(past.id)).toBe("ABSENT");
    await setAttendance(db, past.id, null, NOW);
    expect(await attendanceOf(past.id)).toBeNull();
  });

  it("시작 전·취소·지운 슬롯의 수업과 잘못된 값은 막는다", async () => {
    const { t, s, db } = await setup();
    const future = await lessonAt(t.id, s.id, at(10, 12 * 60 + 1));
    await err(setAttendance(db, future.id, "COMPLETED", NOW), "수업이 시작한 뒤에 체크할 수 있어요");

    const canceled = await lessonAt(t.id, s.id, at(9, 19 * 60));
    await prisma.lesson.update({ where: { id: canceled.id }, data: { canceledAt: NOW } });
    await err(setAttendance(db, canceled.id, "COMPLETED", NOW), "없는 수업이에요");

    const deletedSlot = await lessonAt(t.id, s.id, at(8, 19 * 60));
    await prisma.slot.update({ where: { id: deletedSlot.slotId }, data: { deletedAt: NOW } });
    await err(setAttendance(db, deletedSlot.id, "COMPLETED", NOW), "없는 수업이에요");

    const past = await lessonAt(t.id, s.id, at(7, 19 * 60));
    await err(setAttendance(db, past.id, "LATE", NOW), "잘못된 요청이에요");
    await err(setAttendance(db, "not-an-id", "COMPLETED", NOW), "잘못된 요청이에요");
    await err(setAttendance(db, randomUUID(), "COMPLETED", NOW), "없는 수업이에요");
    for (const l of [future, canceled, deletedSlot, past]) expect(await attendanceOf(l.id)).toBeNull();
  });

  it("다른 선생님 학생의 수업은 체크할 수 없다", async () => {
    const a = await setup();
    const b = await setup();
    const lesson = await lessonAt(b.t.id, b.s.id, at(9, 19 * 60));
    await err(setAttendance(a.db, lesson.id, "COMPLETED", NOW), "없는 수업이에요");
    expect(await attendanceOf(lesson.id)).toBeNull();
  });

  it("학생 범위(선생님이 대신 바꾸기 포함)에서는 출석을 쓸 수 없다", async () => {
    const { t, s } = await setup();
    const lesson = await lessonAt(t.id, s.id, at(9, 19 * 60));
    for (const db of [studentDb(t.id, s.id), studentDbByTeacher(t.id, s.id)]) {
      await expect(db.lesson.updateMany({ where: { id: lesson.id }, data: { attendance: "COMPLETED" } })).rejects.toThrow(ScopeError);
      await expect(db.lesson.update({ where: { id: lesson.id }, data: { attendance: "COMPLETED" } })).rejects.toThrow(ScopeError);
      await expect(setAttendance(db, lesson.id, "COMPLETED", NOW)).rejects.toThrow(ScopeError);
    }
    const slot = await prisma.slot.create({ data: { teacherId: t.id, startsAt: at(20, 19 * 60), endsAt: at(20, 20 * 60) } });
    await expect(studentDb(t.id, s.id).lesson.create({ data: { slotId: slot.id, attendance: "COMPLETED" } as never })).rejects.toThrow(ScopeError);
    expect(await attendanceOf(lesson.id)).toBeNull();
  });

  it("체크해도 학생의 예약·취소 흐름은 그대로 (출석은 건드리지 않는다)", async () => {
    const { t, s } = await setup();
    const ctx: StudentCtx = { db: studentDb(t.id, s.id), teacherId: t.id, studentId: s.id };
    const slot = await prisma.slot.create({ data: { teacherId: t.id, startsAt: at(15, 19 * 60), endsAt: at(15, 20 * 60) } });
    const { lessonId } = await bookSlot(ctx, slot.id, NOW);
    await cancelLesson(ctx, lessonId, NOW);
    await bookSlot(ctx, slot.id, NOW); // 되살리기
    expect(await attendanceOf(lessonId)).toBeNull();
  });
});

describe("학생별 수업 이력 (LESSON-02)", () => {
  it("시작한 수업만 최근 것부터, 합계와 함께. 다른 학생·다른 선생님 것은 빠진다", async () => {
    const { t, s, db } = await setup();
    const other = await newStudent(t.id);
    const b = await setup();

    const l1 = await lessonAt(t.id, s.id, at(1, 19 * 60));
    const l2 = await lessonAt(t.id, s.id, at(3, 19 * 60));
    const l3 = await lessonAt(t.id, s.id, at(5, 19 * 60));
    await lessonAt(t.id, s.id, at(15, 19 * 60)); // 앞으로의 수업
    const canceled = await lessonAt(t.id, s.id, at(7, 19 * 60));
    await prisma.lesson.update({ where: { id: canceled.id }, data: { canceledAt: at(6, 0) } });
    await lessonAt(t.id, other.id, at(2, 19 * 60));
    await lessonAt(b.t.id, b.s.id, at(2, 19 * 60));

    await setAttendance(db, l1.id, "COMPLETED", NOW);
    await setAttendance(db, l2.id, "ABSENT", NOW);

    const r = await lessonRecords(db, s.id, NOW);
    expect(r.lessons.map((l) => [l.id, l.attendance])).toEqual([
      [l3.id, null],
      [l2.id, "ABSENT"],
      [l1.id, "COMPLETED"],
    ]);
    expect(r.totals).toEqual({ completed: 1, absent: 1, unchecked: 1 });

    // 다른 선생님 범위로는 이 학생 이력이 안 보인다
    expect(await lessonRecords(b.db, s.id, NOW)).toEqual({ lessons: [], totals: { completed: 0, absent: 0, unchecked: 0 } });
  });

  it("어드민 달력 슬롯에 학생별 출석이 실린다", async () => {
    const { t, s, db } = await setup();
    const lesson = await lessonAt(t.id, s.id, at(9, 19 * 60));
    await setAttendance(db, lesson.id, "ABSENT", NOW);
    const [slot] = await listMonthSlots(db, { year: 2026, month: 12 });
    expect(slot.students).toEqual([{ lessonId: lesson.id, name: "S", fixed: false, attendance: "ABSENT" }]);
  });
});
