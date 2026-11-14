import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import { daysAgo, studyOverview } from "./overview";
import { toDbDate } from "./study";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 15 * 60); // 12/10 15:00 KST
const DEC = { year: 2026, month: 12 };

async function newTeacher() {
  return prisma.teacher.create({ data: { name: "T", email: `to-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x" } });
}

async function newStudent(teacherId: string, name: string, createdAt: Date, deactivatedAt?: Date) {
  return prisma.student.create({
    data: { teacherId, name, birthYear: 1990, gender: "FEMALE", email: `so-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x", createdAt, deactivatedAt },
  });
}

const log = (teacherId: string, studentId: string | null, date: string, minutes = 30, deletedAt?: Date) =>
  prisma.studyLog.create({ data: { teacherId, studentId, studyDate: toDbDate(date), minutes, deletedAt } });

describe("어드민 공부 기록 (STUDY-10)", () => {
  it("날짜별 공부 시간, 이 달 합계, 연속 일수, 마지막 기록", async () => {
    const t = await newTeacher();
    const s = await newStudent(t.id, "가", kstToUtc(2026, 11, 1));
    await log(t.id, s.id, "2026-11-30");
    await log(t.id, s.id, "2026-12-01", 20);
    await log(t.id, s.id, "2026-12-01", 25); // 같은 날 두 건은 합친다
    await log(t.id, s.id, "2026-12-08");
    await log(t.id, s.id, "2026-12-09", 60);
    await log(t.id, s.id, "2026-12-07", 30, NOW); // 지운 기록은 세지 않는다

    const [row] = await studyOverview(teacherDb(t.id), DEC, NOW);
    expect(row.days.slice(0, 11)).toEqual([45, 0, 0, 0, 0, 0, 0, 30, 60, 0, null]);
    expect(row.days).toHaveLength(31);
    expect(row).toMatchObject({ monthMinutes: 135, studiedDays: 3, countedDays: 10, lastDate: "2026-12-09" });
    // 오늘 아직 안 했으면 어제까지 이어진 것을 센다
    expect(row.streak).toBe(2);
    expect(daysAgo("2026-12-09", NOW)).toBe(1);

    await log(t.id, s.id, "2026-12-10");
    expect((await studyOverview(teacherDb(t.id), DEC, NOW))[0].streak).toBe(3);
  });

  it("그저께가 마지막이면 연속은 0. 지난달 말부터 이어지면 달을 넘어 센다", async () => {
    const t = await newTeacher();
    const a = await newStudent(t.id, "가", kstToUtc(2026, 11, 1));
    const b = await newStudent(t.id, "나", kstToUtc(2026, 11, 1));
    await log(t.id, a.id, "2026-12-08");
    for (const d of ["2026-11-29", "2026-11-30", "2026-12-01"]) await log(t.id, b.id, d);

    const rows = await studyOverview(teacherDb(t.id), DEC, kstToUtc(2026, 12, 2, 9 * 60));
    expect(rows.map((r) => [r.name, r.streak])).toEqual([
      ["가", 0],
      ["나", 3],
    ]);
  });

  it("가입 전 날은 빈칸이고 분모에서 뺀다. 그 달 뒤에 가입한 학생과 비활성 학생은 없다", async () => {
    const t = await newTeacher();
    const s = await newStudent(t.id, "가", kstToUtc(2026, 12, 5, 10 * 60));
    await newStudent(t.id, "늦게", kstToUtc(2027, 1, 2));
    await newStudent(t.id, "비활성", kstToUtc(2026, 11, 1), kstToUtc(2026, 12, 3));

    const rows = await studyOverview(teacherDb(t.id), DEC, NOW);
    expect(rows.map((r) => r.id)).toEqual([s.id]);
    expect(rows[0].days.slice(0, 6)).toEqual([null, null, null, null, 0, 0]);
    expect(rows[0]).toMatchObject({ countedDays: 6, studiedDays: 0, streak: 0, lastDate: null });
  });

  it("선생님 본인 기록은 넣지 않고, 다른 선생님의 학생·기록은 보이지 않는다", async () => {
    const t = await newTeacher();
    const other = await newTeacher();
    const s = await newStudent(t.id, "가", kstToUtc(2026, 11, 1));
    const x = await newStudent(other.id, "남의 학생", kstToUtc(2026, 11, 1));
    await log(t.id, null, "2026-12-09"); // 선생님 본인 기록
    await log(other.id, x.id, "2026-12-09");

    const rows = await studyOverview(teacherDb(t.id), DEC, NOW);
    expect(rows.map((r) => r.id)).toEqual([s.id]);
    expect(rows[0]).toMatchObject({ studiedDays: 0, lastDate: null });
    expect((await studyOverview(teacherDb(other.id), DEC, NOW)).map((r) => r.id)).toEqual([x.id]);
  });
});
