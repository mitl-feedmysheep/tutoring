import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { teacherDb } from "@/lib/db/scope";
import { RESET_PASSWORD, resetStudentPassword } from "@/lib/admin/students";
import { authenticate, changePassword, loadAccount } from "./login";
import { hashPassword, verifyPassword } from "./password";
import { signSession, verifySession } from "./token";

afterAll(() => prisma.$disconnect());

const PW = "pass-1234";

async function setup() {
  const tag = randomUUID().slice(0, 8);
  const passwordHash = await hashPassword(PW);
  const teacher = await prisma.teacher.create({ data: { name: "선생", email: `t-${tag}@test.local`, passwordHash } });
  const student = await prisma.student.create({
    data: { teacherId: teacher.id, name: "학생", birthYear: 1990, gender: "MALE", email: `s-${tag}@test.local`, passwordHash },
  });
  return { tag, teacher, student };
}

describe("세션 토큰", () => {
  it("서명한 값을 그대로 돌려받고, 변조하면 거부한다", async () => {
    const claims = { role: "student" as const, teacherId: "t1", studentId: "s1", v: 3 };
    const token = await signSession(claims, "app");
    expect(await verifySession(token, "app")).toEqual(claims);

    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), teacherId: "t2" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, "app")).toBeNull();
    expect(await verifySession("garbage", "app")).toBeNull();
  });
});

describe("웹앱·어드민 로그인 분리", () => {
  it("웹앱 토큰은 어드민에서, 어드민 토큰은 웹앱에서 쓸 수 없다", async () => {
    const claims = { role: "teacher" as const, teacherId: "t1", v: 0 };
    const app = await signSession(claims, "app");
    const admin = await signSession(claims, "admin");
    expect(await verifySession(app, "admin")).toBeNull();
    expect(await verifySession(admin, "app")).toBeNull();
    expect(await verifySession(admin, "admin")).toEqual(claims);
  });
});

describe("로그인", () => {
  it("선생님·학생 모두 이메일 대소문자 상관없이 로그인한다", async () => {
    const { tag, teacher, student } = await setup();
    const t = await authenticate(`T-${tag}@TEST.local`, PW);
    expect(t.claims).toEqual({ role: "teacher", teacherId: teacher.id, v: 0 });
    const s = await authenticate(` s-${tag}@test.local `, PW);
    expect(s.claims).toEqual({ role: "student", teacherId: teacher.id, studentId: student.id, v: 0 });
  });

  it("틀린 비밀번호와 없는 이메일은 같은 문구로 거부한다", async () => {
    const { tag } = await setup();
    await expect(authenticate(`t-${tag}@test.local`, "wrong-pass")).rejects.toThrow("이메일 또는 비밀번호");
    await expect(authenticate(`nobody-${tag}@test.local`, PW)).rejects.toThrow("이메일 또는 비밀번호");
  });

  it("비활성·삭제된 학생과 삭제된 선생님은 로그인할 수 없다", async () => {
    const { tag, teacher, student } = await setup();
    await prisma.student.update({ where: { id: student.id }, data: { deactivatedAt: new Date() } });
    await expect(authenticate(`s-${tag}@test.local`, PW)).rejects.toThrow();

    await prisma.student.update({ where: { id: student.id }, data: { deactivatedAt: null } });
    await prisma.teacher.update({ where: { id: teacher.id }, data: { deletedAt: new Date() } });
    await expect(authenticate(`t-${tag}@test.local`, PW)).rejects.toThrow();
    await expect(authenticate(`s-${tag}@test.local`, PW)).rejects.toThrow(); // 선생님이 없으면 학생도
  });
});

describe("계정 상태 확인", () => {
  it("비밀번호를 바꾸거나 비활성화하면 예전 토큰은 무효", async () => {
    const { tag, student } = await setup();
    const account = await authenticate(`s-${tag}@test.local`, PW);
    expect(await loadAccount(account.claims)).not.toBeNull();

    await prisma.student.update({ where: { id: student.id }, data: { sessionVersion: { increment: 1 } } });
    expect(await loadAccount(account.claims)).toBeNull();

    const fresh = await authenticate(`s-${tag}@test.local`, PW);
    await prisma.student.update({ where: { id: student.id }, data: { deactivatedAt: new Date() } });
    expect(await loadAccount(fresh.claims)).toBeNull();
  });

  it("토큰의 teacherId가 학생의 실제 선생님과 다르면 무효", async () => {
    const a = await setup();
    const b = await setup();
    expect(await loadAccount({ role: "student", teacherId: b.teacher.id, studentId: a.student.id, v: 0 })).toBeNull();
  });
});

describe("비밀번호 초기화와 변경 (AUTH-07, AUTH-08)", () => {
  it("초기화하면 12341234로 로그인되고, 변경 전까지 mustChangePassword. 현재 비밀번호 없이 바꾼다", async () => {
    const { tag, teacher, student } = await setup();
    const before = await authenticate(`s-${tag}@test.local`, PW);

    expect(await resetStudentPassword(teacherDb(teacher.id), student.id)).toBe(true);
    expect(await loadAccount(before.claims)).toBeNull(); // 기존 로그인 끊김

    const account = await authenticate(`s-${tag}@test.local`, RESET_PASSWORD);
    expect(account.mustChangePassword).toBe(true);

    await expect(changePassword(account, { next: RESET_PASSWORD, confirm: RESET_PASSWORD })).rejects.toThrow("다른 비밀번호");
    await expect(changePassword(account, { next: "new-pass-1", confirm: "new-pass-2" })).rejects.toThrow("서로 다릅니다");
    const claims = await changePassword(account, { next: "new-pass-1", confirm: "new-pass-1" });

    const after = await loadAccount(claims);
    expect(after?.mustChangePassword).toBe(false);
    expect(await loadAccount(account.claims)).toBeNull();
    const row = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(await verifyPassword("new-pass-1", row.passwordHash)).toBe(true);
  });

  it("평소 변경은 현재 비밀번호가 맞아야 한다", async () => {
    const { tag } = await setup();
    const account = await authenticate(`t-${tag}@test.local`, PW);
    await expect(changePassword(account, { current: "wrong-pass", next: "new-pass-1", confirm: "new-pass-1" })).rejects.toThrow("현재 비밀번호");
    await expect(changePassword(account, { current: PW, next: "new-pass-1", confirm: "new-pass-1" })).resolves.toMatchObject({ v: 1 });
  });

  it("다른 선생님의 학생 비밀번호는 초기화할 수 없다", async () => {
    const a = await setup();
    const b = await setup();
    expect(await resetStudentPassword(teacherDb(b.teacher.id), a.student.id)).toBe(false);
    const row = await prisma.student.findUniqueOrThrow({ where: { id: a.student.id } });
    expect(row.mustChangePassword).toBe(false);
    expect(row.sessionVersion).toBe(0);
  });
});
