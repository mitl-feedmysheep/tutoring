import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { ScopeError, studentDb, teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import { ScheduleError } from "@/lib/schedule/teacher";
import { monthPayments, paidDateText, paymentHistory, setPayment } from "./payments";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 9 * 60); // 12/10 09:00 KST
const SIGNUP = kstToUtc(2026, 10, 1, 0 * 60 + 5); // 10/1 00:05 KST (UTC로는 9/30)
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `tp-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string, name = "S", createdAt = SIGNUP) {
  return prisma.student.create({
    data: { teacherId, name, birthYear: 1990, gender: "FEMALE", email: `sp-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x", createdAt },
  });
}

async function setup() {
  const t = await newTeacher();
  const s = await newStudent(t.id);
  return { t, s, db: teacherDb(t.id) };
}

const raw = (studentId: string) => prisma.payment.findMany({ where: { studentId }, select: { month: true, paidAt: true, deletedAt: true } });

describe("납부 체크", () => {
  it("체크, 풀기, 다시 체크하면 같은 행을 되살린다", async () => {
    const { s, db } = await setup();
    await setPayment(db, s.id, "2026-12", true, NOW);
    await setPayment(db, s.id, "2026-12", true, NOW); // 두 번 눌러도 하나
    expect(await raw(s.id)).toEqual([{ month: new Date("2026-12-01"), paidAt: NOW, deletedAt: null }]);

    await setPayment(db, s.id, "2026-12", false, NOW);
    expect((await raw(s.id))[0].deletedAt).toEqual(NOW);
    expect((await monthPayments(db, { year: 2026, month: 12 }))[0].paidAt).toBeNull();

    const later = new Date(NOW.getTime() + 60_000);
    await setPayment(db, s.id, "2026-12", true, later);
    expect(await raw(s.id)).toEqual([{ month: new Date("2026-12-01"), paidAt: later, deletedAt: null }]);
  });

  it("가입한 달부터 다음 달까지만 체크할 수 있다", async () => {
    const { s, db } = await setup();
    await setPayment(db, s.id, "2026-10", true, NOW); // 가입한 달 (KST 기준)
    await setPayment(db, s.id, "2027-01", true, NOW); // 다음 달 선납
    await err(setPayment(db, s.id, "2026-09", true, NOW), "체크할 수 없는 달이에요");
    await err(setPayment(db, s.id, "2027-02", true, NOW), "체크할 수 없는 달이에요");
  });

  it("잘못된 값과 비활성 학생은 거절한다", async () => {
    const { t, s, db } = await setup();
    await err(setPayment(db, s.id, "2026-13", true, NOW), "잘못된 요청이에요");
    await err(setPayment(db, s.id, "2026-12", "yes", NOW), "잘못된 요청이에요");
    await err(setPayment(db, "x", "2026-12", true, NOW), "잘못된 요청이에요");
    const gone = await newStudent(t.id);
    await prisma.student.update({ where: { id: gone.id }, data: { deactivatedAt: NOW } });
    await err(setPayment(db, gone.id, "2026-12", true, NOW), "없는 학생이에요");
  });
});

describe("달별 목록", () => {
  it("그 달 말까지 가입한 활성 학생, 이름 순", async () => {
    const { t, s, db } = await setup();
    const b = await newStudent(t.id, "가나다");
    await newStudent(t.id, "늦게", kstToUtc(2026, 12, 1, 0)); // 12월 가입
    const gone = await newStudent(t.id, "나감");
    await prisma.student.update({ where: { id: gone.id }, data: { deactivatedAt: NOW } });
    await setPayment(db, b.id, "2026-11", true, NOW);

    const nov = await monthPayments(db, { year: 2026, month: 11 });
    expect(nov.map((r) => [r.name, r.paidAt])).toEqual([
      [s.name, null],
      ["가나다", NOW],
    ]);
    expect((await monthPayments(db, { year: 2026, month: 12 })).map((r) => r.name)).toEqual(["S", "가나다", "늦게"]);
  });

  it("학생 한 명: 선생님은 다음 달까지, 학생은 이번 달까지 (미리 체크한 다음 달은 포함)", async () => {
    const { t, s, db } = await setup();
    await setPayment(db, s.id, "2026-11", true, NOW);
    const teacher = await paymentHistory(db, s.id, "next", NOW);
    expect(teacher!.map((m) => [m.key, m.paidAt])).toEqual([
      ["2027-01", null],
      ["2026-12", null],
      ["2026-11", NOW],
      ["2026-10", null],
    ]);

    const me = studentDb(t.id, s.id);
    expect((await paymentHistory(me, s.id, "this", NOW))!.map((m) => m.key)).toEqual(["2026-12", "2026-11", "2026-10"]);
    await setPayment(db, s.id, "2027-01", true, NOW);
    expect((await paymentHistory(me, s.id, "this", NOW))!.map((m) => m.key)).toEqual(["2027-01", "2026-12", "2026-11", "2026-10"]);
  });

  it("보여 주는 날짜는 KST", () => {
    expect(paidDateText(kstToUtc(2026, 11, 3, 30))).toBe("11월 3일");
  });
});

describe("격리", () => {
  it("다른 선생님의 학생은 체크하거나 볼 수 없다", async () => {
    const a = await setup();
    const b = await setup();
    await setPayment(b.db, b.s.id, "2026-12", true, NOW);

    await err(setPayment(a.db, b.s.id, "2026-12", true, NOW), "없는 학생이에요");
    await err(setPayment(a.db, b.s.id, "2026-12", false, NOW), "없는 학생이에요");
    expect(await paymentHistory(a.db, b.s.id, "next", NOW)).toBeNull();
    expect((await monthPayments(a.db, { year: 2026, month: 12 })).map((r) => r.id)).toEqual([a.s.id]);
    expect((await raw(b.s.id))[0].deletedAt).toBeNull();
  });

  it("학생은 다른 학생 납부를 못 보고, 체크할 수 없다", async () => {
    const { t, s, db } = await setup();
    const other = await newStudent(t.id);
    await setPayment(db, other.id, "2026-12", true, NOW);

    const me = studentDb(t.id, s.id);
    expect(await paymentHistory(me, other.id, "this", NOW)).toBeNull();
    expect(await me.payment.findMany()).toEqual([]);
    await expect(setPayment(me, s.id, "2026-12", true, NOW)).rejects.toBeInstanceOf(ScopeError);
  });

  it("되살리기(deletedAt 조건)도 범위 밖 행은 건드리지 못한다", async () => {
    const a = await setup();
    const b = await setup();
    await setPayment(b.db, b.s.id, "2026-12", true, NOW);
    await setPayment(b.db, b.s.id, "2026-12", false, NOW);

    const { count } = await a.db.payment.updateMany({ where: { studentId: b.s.id, deletedAt: { not: null } }, data: { deletedAt: null } });
    expect(count).toBe(0);
    expect((await raw(b.s.id))[0].deletedAt).toEqual(NOW);
  });
});
