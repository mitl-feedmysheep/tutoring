import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { teacherDb } from "@/lib/db/scope";
import { isEmailTaken } from "@/lib/auth/accounts";
import { loadAccount } from "@/lib/auth/login";
import { generateMonth } from "@/lib/schedule/generate";
import { kstToUtc } from "@/lib/schedule/kst";
import { createOneOffSlot, createWeeklySlot, listWeeklySlots } from "@/lib/schedule/teacher";
import { deactivateStudent, listDeactivatedStudents, listStudents, reactivateStudent, setOccupation } from "./students";
import { studentProfile } from "./student-schedule";

afterAll(() => prisma.$disconnect());

const MID_DEC = kstToUtc(2026, 12, 10, 12 * 60); // 12/10(목) 12:00
const TUE_19 = { weekday: 2, startMinute: 19 * 60, endMinute: 20 * 60 }; // 12월 화요일: 1, 8, 15, 22, 29

async function setup() {
  const tag = randomUUID().slice(0, 8);
  const t = await prisma.teacher.create({ data: { name: "T", email: `st-${tag}@test.local`, passwordHash: "x" } });
  const db = teacherDb(t.id);
  const email = `kim-${tag}@test.local`;
  const s = await prisma.student.create({ data: { teacherId: t.id, name: "김", birthYear: 1990, gender: "MALE", email, passwordHash: "x" } });
  return { t, db, s, email };
}

/** 학생의 수업: [슬롯 시작(KST 일), 취소 여부] */
async function lessonsOf(studentId: string) {
  const rows = await prisma.lesson.findMany({ where: { studentId, deletedAt: null }, select: { canceledAt: true, slot: { select: { startsAt: true } } }, orderBy: { slot: { startsAt: "asc" } } });
  return rows.map((r) => [new Date(r.slot.startsAt.getTime() + 9 * 3600_000).getUTCDate(), r.canceledAt === null]);
}

describe("학생 비활성화 (ADMIN-04)", () => {
  it("로그인이 끊기고, 앞으로의 수업은 취소되고, 지난 수업은 그대로. 목록에서 빠지고 같은 이메일로 새 가입이 된다", async () => {
    const { t, db, s, email } = await setup();
    const w = await createWeeklySlot(db, TUE_19, kstToUtc(2026, 12, 1, 0));
    const wl = await db.weeklyLesson.create({ data: { weeklySlotId: w.id, studentId: s.id } as never });
    const slots = await db.slot.findMany({ where: { weeklySlotId: w.id }, orderBy: { startsAt: "asc" } });
    await db.lesson.createMany({ data: slots.map((x) => ({ slotId: x.id, studentId: s.id, weeklyLessonId: wl.id })) as never });

    const claims = { role: "student" as const, teacherId: t.id, studentId: s.id, v: s.sessionVersion };
    expect(await loadAccount(claims)).not.toBeNull();
    expect(await deactivateStudent(db, s.id, MID_DEC)).toEqual({ canceled: 3 }); // 15, 22, 29
    expect(await loadAccount(claims)).toBeNull();
    expect(await lessonsOf(s.id)).toEqual([[1, true], [8, true], [15, false], [22, false], [29, false]]);

    expect((await listStudents(db)).map((x) => x.id)).not.toContain(s.id);
    expect(await listDeactivatedStudents(db)).toMatchObject([{ id: s.id, email }]);
    expect(await studentProfile(db, s.id)).toMatchObject({ email, deactivatedAt: MID_DEC }); // 카드에서 기록은 본다
    expect(await isEmailTaken(email)).toBe(false);
    // 고정 일정은 남지만 고정 시간 목록 이름에서는 빠진다
    expect(await db.weeklyLesson.count({ where: { studentId: s.id } })).toBe(1);
    expect(await listWeeklySlots(db)).toMatchObject([{ students: [] }]);
    await expect(deactivateStudent(db, s.id, MID_DEC)).rejects.toThrow("없는 학생");
  });

  it("다시 활성화하면 원래 이메일로 돌아오고, 비활성화 때 취소된 수업과 그동안 만든 고정 수업이 다시 잡힌다. 직접 취소한 수업은 그대로", async () => {
    const { db, s, email } = await setup();
    const w = await createWeeklySlot(db, TUE_19, kstToUtc(2026, 12, 1, 0));
    const wl = await db.weeklyLesson.create({ data: { weeklySlotId: w.id, studentId: s.id } as never });
    const slots = await db.slot.findMany({ where: { weeklySlotId: w.id }, orderBy: { startsAt: "asc" } });
    await db.lesson.createMany({ data: slots.map((x) => ({ slotId: x.id, studentId: s.id, weeklyLessonId: wl.id })) as never });
    // 학생이 12/22를 미리 취소, 1회성 수업 하나 예약
    await db.lesson.updateMany({ where: { studentId: s.id, slotId: slots[3].id }, data: { canceledAt: kstToUtc(2026, 12, 5, 0) } });
    const extra = await createOneOffSlot(db, { year: 2026, month: 12, day: 17, startMinute: 600, endMinute: 660 }, kstToUtc(2026, 12, 1, 0));
    await db.lesson.create({ data: { slotId: extra.id, studentId: s.id } as never });

    await deactivateStudent(db, s.id, MID_DEC);
    // 비활성 동안 1월이 만들어진다 → 이 학생 수업은 안 생긴다
    await generateMonth(db, { year: 2027, month: 1 }, kstToUtc(2026, 12, 31, 30));
    const janSlots = await db.slot.count({ where: { weeklySlotId: w.id, startsAt: { gte: kstToUtc(2027, 1, 1, 0) } } });
    expect(janSlots).toBe(4);
    expect(await prisma.lesson.count({ where: { studentId: s.id, slot: { startsAt: { gte: kstToUtc(2027, 1, 1, 0) } } } })).toBe(0);

    const later = kstToUtc(2026, 12, 20, 12 * 60); // 15일과 17일은 지났다
    await reactivateStudent(db, s.id, later);
    expect(await studentProfile(db, s.id)).toMatchObject({ email, deactivatedAt: null });
    expect((await prisma.student.findUniqueOrThrow({ where: { id: s.id } })).email).toBe(email);
    const rows = await lessonsOf(s.id);
    expect(rows.slice(0, 6)).toEqual([[1, true], [8, true], [15, false], [17, false], [22, false], [29, true]]);
    expect(rows.slice(6)).toEqual([[5, true], [12, true], [19, true], [26, true]]); // 1월 고정 수업
  });

  it("같은 이메일로 새 계정이 있으면 다시 활성화할 수 없다", async () => {
    const { t, db, s, email } = await setup();
    await deactivateStudent(db, s.id, MID_DEC);
    await prisma.student.create({ data: { teacherId: t.id, name: "새", birthYear: 1990, gender: "MALE", email, passwordHash: "x" } });
    await expect(reactivateStudent(db, s.id, MID_DEC)).rejects.toThrow("다른 계정");
    expect(await listDeactivatedStudents(db)).toHaveLength(1);
  });
});

describe("학생 직업 (AUTH-05)", () => {
  it("입력하고, 비우면 없어진다. 100자까지", async () => {
    const { db, s } = await setup();
    await setOccupation(db, s.id, "  회사원 ");
    expect(await studentProfile(db, s.id)).toMatchObject({ occupation: "회사원" });
    await setOccupation(db, s.id, "");
    expect(await studentProfile(db, s.id)).toMatchObject({ occupation: null });
    await expect(setOccupation(db, s.id, "가".repeat(101))).rejects.toThrow("100자");
  });
});

describe("학생 관리 선생님 간 격리", () => {
  it("다른 선생님 학생은 비활성화·다시 활성화·직업 입력을 할 수 없다", async () => {
    const a = await setup();
    const b = await setup();
    await expect(deactivateStudent(b.db, a.s.id, MID_DEC)).rejects.toThrow("없는 학생");
    await expect(setOccupation(b.db, a.s.id, "x")).rejects.toThrow("없는 학생");
    await deactivateStudent(a.db, a.s.id, MID_DEC);
    await expect(reactivateStudent(b.db, a.s.id, MID_DEC)).rejects.toThrow("없는 학생");
    expect(await listDeactivatedStudents(b.db)).toHaveLength(0);
    expect(await studentProfile(b.db, a.s.id)).toBeNull();
  });
});
