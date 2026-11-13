import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { myTeacherName } from "./profile";

vi.mock("server-only", () => ({}));
afterAll(() => prisma.$disconnect());

async function teacherWithStudent(name: string) {
  const tag = randomUUID().slice(0, 8);
  const teacher = await prisma.teacher.create({ data: { name, email: `t-${tag}@test.local`, passwordHash: "x" } });
  const student = await prisma.student.create({
    data: { teacherId: teacher.id, name: "S", birthYear: 1990, gender: "FEMALE", email: `s-${tag}@test.local`, passwordHash: "x" },
  });
  return { teacherId: teacher.id, studentId: student.id };
}

describe("MY 탭 담당 선생님 이름", () => {
  it("학생은 자기 선생님 이름만 본다", async () => {
    const a = await teacherWithStudent("선생A");
    const b = await teacherWithStudent("선생B");
    expect(await myTeacherName(a.teacherId, a.studentId)).toBe("선생A");
    expect(await myTeacherName(b.teacherId, b.studentId)).toBe("선생B");
  });

});
