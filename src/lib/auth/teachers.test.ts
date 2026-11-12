import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { createTeacher } from "./accounts";
import { authenticate, type Account } from "./login";
import { createTeacherByAdmin, listTeachers, NotAdminError } from "./teachers";

afterAll(() => prisma.$disconnect());

const tag = () => randomUUID().slice(0, 8);

async function makeTeacher(isAdmin: boolean): Promise<Account> {
  const email = `t-${tag()}@test.local`;
  await createTeacher({ name: "T", email, password: "pass-1234", isAdmin, mustChangePassword: false });
  return authenticate(email, "pass-1234");
}

describe("선생님 계정 관리 (ADMIN-05)", () => {
  it("관리자는 선생님을 만들고, 만든 선생님은 관리자가 아니며 첫 로그인 때 비밀번호를 바꿔야 한다", async () => {
    const admin = await makeTeacher(true);
    const email = `new-${tag()}@test.local`;
    const t = await createTeacherByAdmin(admin, { name: "새 선생", email, password: "temp-1234" });
    expect(t).toMatchObject({ name: "새 선생", email, isAdmin: false, mustChangePassword: true });

    const login = await authenticate(email, "temp-1234");
    expect(login.claims.role).toBe("teacher");
    expect(login.mustChangePassword).toBe(true);

    const list = await listTeachers(admin);
    expect(list.map((x) => x.email)).toContain(email);
    expect(list[0]).not.toHaveProperty("passwordHash");
  });

  it("관리자가 아닌 선생님은 목록을 볼 수도, 선생님을 만들 수도 없다", async () => {
    const teacher = await makeTeacher(false);
    const email = `blocked-${tag()}@test.local`;
    expect(() => listTeachers(teacher)).toThrow(NotAdminError);
    expect(() => createTeacherByAdmin(teacher, { name: "X", email, password: "temp-1234" })).toThrow(NotAdminError);
    expect(await prisma.teacher.count({ where: { email } })).toBe(0);
  });

  it("학생 계정은 관리자 표시가 있어도 막힌다", async () => {
    const admin = await makeTeacher(true);
    const fake: Account = {
      claims: { role: "student", teacherId: admin.claims.teacherId, studentId: randomUUID(), v: 0 },
      name: "S",
      isAdmin: true,
      mustChangePassword: false,
    };
    expect(() => listTeachers(fake)).toThrow(NotAdminError);
  });

  it("학생이 쓰는 이메일로는 만들 수 없다", async () => {
    const admin = await makeTeacher(true);
    const email = `s-${tag()}@test.local`;
    await prisma.student.create({
      data: { teacherId: admin.claims.teacherId, name: "S", birthYear: 1990, gender: "MALE", email, passwordHash: "x" },
    });
    await expect(createTeacherByAdmin(admin, { name: "X", email: email.toUpperCase(), password: "temp-1234" })).rejects.toThrow("이미");
  });
});
