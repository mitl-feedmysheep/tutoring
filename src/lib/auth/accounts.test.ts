import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { createTeacher } from "./accounts";
import { verifyPassword } from "./password";

afterAll(() => prisma.$disconnect());

describe("createTeacher", () => {
  it("이메일을 소문자로 저장하고 비밀번호는 해시로만 저장한다", async () => {
    const email = `New-${randomUUID().slice(0, 8)}@Test.Local`;
    const t = await createTeacher({ name: " 선생 ", email, password: "pass-1234", isAdmin: true, mustChangePassword: false });
    expect(t).toMatchObject({ name: "선생", email: email.toLowerCase(), isAdmin: true, mustChangePassword: false });
    const row = await prisma.teacher.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.passwordHash).not.toContain("pass-1234");
    expect(await verifyPassword("pass-1234", row.passwordHash)).toBe(true);
  });

  it("선생님이나 학생이 이미 쓰는 이메일은 거부한다", async () => {
    const tag = randomUUID().slice(0, 8);
    const t = await createTeacher({ name: "A", email: `a-${tag}@test.local`, password: "pass-1234", mustChangePassword: true });
    await expect(createTeacher({ name: "B", email: `A-${tag}@test.local`, password: "pass-1234", mustChangePassword: true })).rejects.toThrow("이미");

    await prisma.student.create({
      data: { teacherId: t.id, name: "S", birthYear: 1990, gender: "MALE", email: `s-${tag}@test.local`, passwordHash: "x" },
    });
    await expect(createTeacher({ name: "C", email: `s-${tag}@test.local`, password: "pass-1234", mustChangePassword: true })).rejects.toThrow("이미");
  });

  it("짧은 비밀번호와 잘못된 이메일은 거부한다", async () => {
    await expect(createTeacher({ name: "A", email: "x@test.local", password: "short", mustChangePassword: true })).rejects.toThrow();
    await expect(createTeacher({ name: "A", email: "not-an-email", password: "pass-1234", mustChangePassword: true })).rejects.toThrow();
  });
});
