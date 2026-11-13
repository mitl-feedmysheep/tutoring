/* eslint-disable @typescript-eslint/no-explicit-any -- 일부러 잘못된 입력을 넣어 보는 테스트 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { RELATIONS, ScopeError, studentDb, teacherDb } from "./scope";
import type { Prisma } from "@/generated/prisma/client";

type Model = Prisma.ModelName;
const MODELS = Object.keys(RELATIONS) as Model[];
const delegate = (db: unknown, model: Model) => (db as any)[model.charAt(0).toLowerCase() + model.slice(1)];

/** 선생님 1명과 학생 2명, 모든 테이블에 한 줄씩 */
async function createTenant() {
  const tag = randomUUID().slice(0, 8);
  const teacher = await prisma.teacher.create({
    data: { name: `T${tag}`, email: `t-${tag}@test.local`, passwordHash: "x" },
  });
  const t = teacher.id;
  const student = (n: number) =>
    prisma.student.create({
      data: { teacherId: t, name: `S${n}`, birthYear: 1990, gender: "FEMALE", email: `s${n}-${tag}@test.local`, passwordHash: "x" },
    });
  const s1 = await student(1);
  const s2 = await student(2);

  const weeklySlot = await prisma.weeklySlot.create({ data: { teacherId: t, weekday: 2, startMinute: 1140, endMinute: 1200 } });
  const slot = await prisma.slot.create({
    data: { teacherId: t, weeklySlotId: weeklySlot.id, startsAt: new Date("2026-12-01T10:00:00Z"), endsAt: new Date("2026-12-01T11:00:00Z") },
  });
  const monthlySlotHistory = await prisma.monthlySlotHistory.create({ data: { teacherId: t, month: new Date("2026-12-01") } });
  const weeklyLesson = await prisma.weeklyLesson.create({ data: { teacherId: t, studentId: s1.id, weeklySlotId: weeklySlot.id } });
  const lesson1 = await prisma.lesson.create({ data: { teacherId: t, slotId: slot.id, studentId: s1.id, weeklyLessonId: weeklyLesson.id } });
  const lesson2 = await prisma.lesson.create({ data: { teacherId: t, slotId: slot.id, studentId: s2.id } });
  const teacherNote = await prisma.lessonNote.create({ data: { teacherId: t, lessonId: lesson1.id, author: "TEACHER", content: "teacher" } });
  const studentNote = await prisma.lessonNote.create({ data: { teacherId: t, lessonId: lesson1.id, author: "STUDENT", content: "student" } });
  const otherNote = await prisma.lessonNote.create({ data: { teacherId: t, lessonId: lesson2.id, author: "STUDENT", content: "s2" } });
  const scheduleChange = await prisma.scheduleChange.create({
    data: { teacherId: t, studentId: s1.id, lessonId: lesson1.id, action: "ADD", changedBy: "STUDENT" },
  });
  const studyLog = await prisma.studyLog.create({ data: { teacherId: t, studentId: s1.id, studyDate: new Date("2026-12-01"), minutes: 30 } });
  const ownStudyLog = await prisma.studyLog.create({ data: { teacherId: t, studyDate: new Date("2026-12-01"), minutes: 60 } });
  const photo = await prisma.file.create({
    data: { teacherId: t, uploaderStudentId: s1.id, kind: "STUDY_PHOTO", studyLogId: studyLog.id, fileName: "a.jpg", r2Key: `k-${tag}-1`, contentType: "image/jpeg", sizeBytes: 1 },
  });
  const openMaterial = await prisma.file.create({
    data: { teacherId: t, kind: "MATERIAL", fileName: "open.pdf", r2Key: `k-${tag}-2`, contentType: "application/pdf", sizeBytes: 1 },
  });
  const closedMaterial = await prisma.file.create({
    data: { teacherId: t, kind: "MATERIAL", fileName: "closed.pdf", r2Key: `k-${tag}-3`, contentType: "application/pdf", sizeBytes: 1 },
  });
  const fileAccess = await prisma.fileAccess.create({ data: { teacherId: t, fileId: openMaterial.id, studentId: s1.id } });
  const payment = await prisma.payment.create({ data: { teacherId: t, studentId: s1.id, month: new Date("2026-12-01"), paidAt: new Date() } });
  const board = await prisma.board.create({ data: { teacherId: t, studentId: s1.id, author: "STUDENT", title: "q", content: "q" } });
  const otherBoard = await prisma.board.create({ data: { teacherId: t, studentId: s2.id, author: "STUDENT", title: "q2", content: "q2" } });
  const teacherComment = await prisma.comment.create({ data: { teacherId: t, boardId: board.id, author: "TEACHER", content: "a" } });
  const push = (who: string, studentId: string | null) =>
    prisma.pushSubscription.create({ data: { teacherId: t, studentId, endpoint: `https://push.test/${tag}-${who}`, p256dh: "k", auth: "a" } });
  const pushS1 = await push("s1", s1.id);
  const pushTeacher = await push("t", null);
  const invite = await prisma.invite.create({
    data: { teacherId: t, tokenHash: randomUUID().replace(/-/g, "").padEnd(64, "0"), expiresAt: new Date(Date.now() + 3600_000) },
  });

  return {
    teacher, s1, s2, weeklySlot, slot, monthlySlotHistory, weeklyLesson, lesson1, lesson2, teacherNote, studentNote, otherNote,
    scheduleChange, studyLog, ownStudyLog, photo, openMaterial, closedMaterial, fileAccess, payment, board, otherBoard,
    teacherComment, invite, pushS1, pushTeacher,
    /** 모델마다 이 선생님 소유인 행 하나 */
    rowOf: {} as Record<Model, { id: string }>,
  };
}

type Tenant = Awaited<ReturnType<typeof createTenant>>;

function fillRows(x: Tenant) {
  x.rowOf = {
    Teacher: x.teacher, Student: x.s1, Invite: x.invite, WeeklySlot: x.weeklySlot, Slot: x.slot, MonthlySlotHistory: x.monthlySlotHistory, WeeklyLesson: x.weeklyLesson,
    Lesson: x.lesson1, ScheduleChange: x.scheduleChange, LessonNote: x.teacherNote, StudyLog: x.studyLog, File: x.photo,
    FileAccess: x.fileAccess, Payment: x.payment, Board: x.board, Comment: x.teacherComment,
    PushSubscription: x.pushS1,
  };
  return x;
}

let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  A = fillRows(await createTenant());
  B = fillRows(await createTenant());
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("관계 목록", () => {
  it("RELATIONS가 스키마의 관계와 같다 (관계를 추가하면 RELATIONS도 고쳐야 한다)", () => {
    const models = (prisma as any)._runtimeDataModel.models as Record<string, { fields: { name: string; kind: string }[] }>;
    expect(Object.keys(models).sort()).toEqual([...MODELS].sort());
    for (const model of MODELS) {
      const fromSchema = models[model].fields.filter((f) => f.kind === "object").map((f) => f.name).sort();
      const fromMap = [...Object.keys(RELATIONS[model].many), ...Object.keys(RELATIONS[model].one)].sort();
      expect(fromMap, model).toEqual(fromSchema);
    }
  });
});

describe("선생님 간 격리", () => {
  it.each(MODELS)("%s: A 범위에서 B 데이터를 읽을 수 없다", async (model) => {
    const db = delegate(teacherDb(A.teacher.id), model);
    const bRow = B.rowOf[model];

    const rows: { id: string; teacherId?: string }[] = await db.findMany();
    expect(rows.map((r) => r.id)).toContain(A.rowOf[model].id);
    expect(rows.map((r) => r.id)).not.toContain(bRow.id);
    for (const r of rows) expect(model === "Teacher" ? r.id : r.teacherId).toBe(A.teacher.id);

    expect(await db.findUnique({ where: { id: bRow.id } })).toBeNull();
    expect(await db.findFirst({ where: { id: bRow.id } })).toBeNull();
    expect(await db.count({ where: { id: bRow.id } })).toBe(0);
  });

  it.each(MODELS)("%s: A 범위에서 B 데이터를 수정할 수 없다", async (model) => {
    const db = delegate(teacherDb(A.teacher.id), model);
    const bRow = B.rowOf[model];
    const res = await db.updateMany({ where: { id: bRow.id }, data: { deletedAt: new Date() } });
    expect(res.count).toBe(0);
    await expect(db.update({ where: { id: bRow.id }, data: { deletedAt: new Date() } })).rejects.toMatchObject({ code: "P2025" });
    const still = await delegate(prisma, model).findUnique({ where: { id: bRow.id } });
    expect(still.deletedAt).toBeNull();
  });

  it("만들 때 teacher_id가 세션 값으로 채워지고, 다른 값은 거부된다", async () => {
    const db = teacherDb(A.teacher.id);
    const ws = await db.weeklySlot.create({ data: { weekday: 3, startMinute: 600, endMinute: 660 } as any });
    expect(ws.teacherId).toBe(A.teacher.id);
    await expect(
      db.weeklySlot.create({ data: { teacherId: B.teacher.id, weekday: 3, startMinute: 600, endMinute: 660 } }),
    ).rejects.toBeInstanceOf(ScopeError);
    await expect(db.weeklySlot.createMany({ data: [{ teacherId: B.teacher.id, weekday: 1, startMinute: 0, endMinute: 60 }] })).rejects.toBeInstanceOf(ScopeError);
  });

  it("A 범위에서 B의 학생·슬롯에 연결할 수 없다 (복합 외래키)", async () => {
    const db = teacherDb(A.teacher.id);
    await expect(
      db.payment.create({ data: { teacherId: A.teacher.id, studentId: B.s1.id, month: new Date("2027-01-01"), paidAt: new Date() } }),
    ).rejects.toThrow();
    await expect(db.lesson.create({ data: { teacherId: A.teacher.id, slotId: B.slot.id, studentId: A.s2.id } })).rejects.toThrow();
  });

  it("teacher_id를 다른 선생님으로 바꿀 수 없다", async () => {
    const db = teacherDb(A.teacher.id);
    await expect(db.studyLog.update({ where: { id: A.studyLog.id }, data: { teacherId: B.teacher.id } })).rejects.toBeInstanceOf(ScopeError);
  });

  it("include로 딸려오는 목록도 A 것만 나온다", async () => {
    const t = await teacherDb(A.teacher.id).teacher.findUnique({
      where: { id: A.teacher.id },
      include: { students: { include: { lessons: true } }, _count: true },
    });
    expect(t!.students.every((s) => s.teacherId === A.teacher.id)).toBe(true);
    expect(t!._count.students).toBe(2);
  });

  it("범위 없이 만들 수 없다", () => {
    expect(() => teacherDb("")).toThrow(ScopeError);
    expect(() => studentDb(A.teacher.id, "")).toThrow(ScopeError);
  });
});

describe("소프트 삭제", () => {
  it("지운 행은 조회·include·count에서 빠지고, delete는 막힌다", async () => {
    const db = teacherDb(A.teacher.id);
    const tmp = await db.board.create({ data: { teacherId: A.teacher.id, studentId: A.s1.id, author: "TEACHER", title: "tmp", content: "x" } });
    await db.board.update({ where: { id: tmp.id }, data: { deletedAt: new Date() } });

    expect(await db.board.findUnique({ where: { id: tmp.id } })).toBeNull();
    const s = await db.student.findUnique({ where: { id: A.s1.id }, include: { boards: true, _count: { select: { boards: true } } } });
    expect(s!.boards.map((b) => b.id)).not.toContain(tmp.id);
    expect(s!._count.boards).toBe(s!.boards.length);

    await expect(db.board.delete({ where: { id: A.board.id } })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.board.deleteMany({})).rejects.toBeInstanceOf(ScopeError);
  });

  it("관계 필드로 중첩 쓰기는 막힌다", async () => {
    const db = teacherDb(A.teacher.id);
    await expect(
      db.studyLog.create({
        data: { teacherId: A.teacher.id, studyDate: new Date(), minutes: 5, photos: { create: [] } } as any,
      }),
    ).rejects.toBeInstanceOf(ScopeError);
  });
});

describe("학생 범위", () => {
  const s1db = () => studentDb(A.teacher.id, A.s1.id);

  it("다른 선생님의 학생 id로는 아무것도 안 보인다", async () => {
    const db = studentDb(A.teacher.id, B.s1.id);
    expect(await db.lesson.findMany()).toEqual([]);
    expect(await db.student.findMany()).toEqual([]);
  });

  it("본인 것만 보인다", async () => {
    const db = s1db();
    expect((await db.student.findMany()).map((s) => s.id)).toEqual([A.s1.id]);
    expect((await db.lesson.findMany()).map((l) => l.id)).toEqual([A.lesson1.id]);
    expect((await db.board.findMany()).map((b) => b.id)).not.toContain(A.otherBoard.id);
    expect(await db.invite.findMany()).toEqual([]);
  });

  it("수업 노트는 학생 노트만 보인다", async () => {
    const notes = await s1db().lessonNote.findMany();
    expect(notes.map((n) => n.id)).toEqual([A.studentNote.id]);
    const lesson = await s1db().lesson.findUnique({ where: { id: A.lesson1.id }, include: { notes: true } });
    expect(lesson!.notes.map((n) => n.author)).toEqual(["STUDENT"]);
  });

  it("같은 슬롯의 다른 학생 수업은 include에서도 안 보인다", async () => {
    const slot = await s1db().slot.findUnique({ where: { id: A.slot.id }, include: { lessons: true } });
    expect(slot!.lessons.map((l) => l.studentId)).toEqual([A.s1.id]);
  });

  it("공부 기록에 선생님 본인 기록은 안 보인다", async () => {
    const logs = await s1db().studyLog.findMany();
    expect(logs.map((l) => l.id)).toEqual([A.studyLog.id]);
  });

  it("알림 구독은 본인 기기만 보이고, 선생님 기기·다른 학생 기기는 안 보인다", async () => {
    expect((await s1db().pushSubscription.findMany()).map((p) => p.id)).toEqual([A.pushS1.id]);
    expect(await studentDb(A.teacher.id, A.s2.id).pushSubscription.findMany()).toEqual([]);
    const sub = await studentDb(A.teacher.id, A.s2.id).pushSubscription.create({
      data: { endpoint: `https://push.test/${randomUUID()}`, p256dh: "k", auth: "a" } as any,
    });
    expect(sub.studentId).toBe(A.s2.id);
    expect(await s1db().pushSubscription.updateMany({ where: { id: sub.id }, data: { deletedAt: new Date() } })).toEqual({ count: 0 });
  });

  it("파일은 본인 사진과 본인에게 공개된 자료만 보인다", async () => {
    const ids = (await s1db().file.findMany()).map((f) => f.id).sort();
    expect(ids).toEqual([A.photo.id, A.openMaterial.id].sort());
    const s2ids = (await studentDb(A.teacher.id, A.s2.id).file.findMany()).map((f) => f.id);
    expect(s2ids).toEqual([]);
  });

  it("만들 때 student_id와 author가 채워지고, 다른 학생 것에는 쓸 수 없다", async () => {
    const db = s1db();
    const log = await db.studyLog.create({ data: { studyDate: new Date("2026-12-02"), minutes: 10 } as any });
    expect(log.studentId).toBe(A.s1.id);
    const c = await db.comment.create({ data: { boardId: A.board.id, content: "hi" } as any });
    expect(c.author).toBe("STUDENT");

    await expect(db.studyLog.create({ data: { studentId: A.s2.id, studyDate: new Date(), minutes: 5 } as any })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.comment.create({ data: { boardId: A.otherBoard.id, content: "x" } as any })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.lessonNote.create({ data: { lessonId: A.lesson2.id, content: "x" } as any })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.lessonNote.create({ data: { lessonId: A.lesson1.id, author: "TEACHER", content: "x" } as any })).rejects.toBeInstanceOf(ScopeError);
  });

  it("같은 트랜잭션에서 방금 만든 내 수업에는 이력을 달 수 있고, 다른 학생 수업에는 여전히 안 된다", async () => {
    const db = s1db();
    const slot = await prisma.slot.create({
      data: { teacherId: A.teacher.id, startsAt: new Date("2026-12-20T10:00:00Z"), endsAt: new Date("2026-12-20T11:00:00Z") },
    });
    const change = await db.$transaction(async (tx) => {
      const lesson = await tx.lesson.create({ data: { slotId: slot.id } as any });
      return tx.scheduleChange.create({ data: { lessonId: lesson.id, action: "ADD" } as any });
    });
    expect(change.studentId).toBe(A.s1.id);
    // 내 수업을 하나 만든 뒤라도 다른 학생 수업은 막힌다
    await expect(db.scheduleChange.create({ data: { lessonId: A.lesson2.id, action: "ADD" } as any })).rejects.toBeInstanceOf(ScopeError);
  });

  it("선생님 노트·댓글, 다른 학생 노트는 수정할 수 없다", async () => {
    const db = s1db();
    expect((await db.lessonNote.updateMany({ where: { id: A.teacherNote.id }, data: { content: "hack" } })).count).toBe(0);
    expect((await db.lessonNote.updateMany({ where: { id: A.otherNote.id }, data: { content: "hack" } })).count).toBe(0);
    expect((await db.comment.updateMany({ where: { id: A.teacherComment.id }, data: { content: "hack" } })).count).toBe(0);
  });

  it("학생은 납부·슬롯·초대·자료 공개·월 생성 기록을 만들거나 바꿀 수 없다", async () => {
    const db = s1db();
    await expect(db.payment.create({ data: { month: new Date("2027-02-01"), paidAt: new Date() } as any })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.payment.updateMany({ data: { paidAt: new Date() } })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.slot.updateMany({ data: { deletedAt: new Date() } })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.fileAccess.create({ data: { fileId: A.closedMaterial.id } as any })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.invite.updateMany({ data: { revokedAt: new Date() } })).rejects.toBeInstanceOf(ScopeError);
    await expect(db.monthlySlotHistory.create({ data: { month: new Date("2027-02-01") } as any })).rejects.toBeInstanceOf(ScopeError);
    expect(await db.monthlySlotHistory.findMany()).toEqual([]);
  });
});
