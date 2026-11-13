import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { teacherDb } from "@/lib/db/scope";
import { issueInvite, listInvites, revokeInvite } from "@/lib/admin/invites";
import { checkInvite, signupWithInvite, type SignupInput } from "./invite";

afterAll(() => prisma.$disconnect());

async function newTeacher() {
  const tag = randomUUID().slice(0, 8);
  const teacher = await prisma.teacher.create({ data: { name: `선생${tag}`, email: `t-${tag}@test.local`, passwordHash: "x" } });
  return { tag, teacher, db: teacherDb(teacher.id) };
}

function form(email: string): SignupInput {
  return { name: "학생", birthYear: "1990", gender: "FEMALE", email, password: "pass-1234", confirm: "pass-1234", agreePrivacy: true };
}

describe("초대 링크 가입", () => {
  it("발급한 선생님에게 소속되고, 링크는 사용됨이 된다. DB에는 토큰 원본이 없다", async () => {
    const { tag, teacher, db } = await newTeacher();
    const { token, id } = await issueInvite(db, teacher.id, "김철수");
    expect(await checkInvite(token)).toEqual({ state: "ok", teacherName: teacher.name });

    const row = await prisma.invite.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).not.toBe(token);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);

    const account = await signupWithInvite(token, form(`New-${tag}@Test.local`));
    expect(account.claims).toMatchObject({ role: "student", teacherId: teacher.id });
    const student = await prisma.student.findFirstOrThrow({ where: { email: `new-${tag}@test.local` } });
    expect(student.teacherId).toBe(teacher.id);

    expect(await checkInvite(token)).toEqual({ state: "used" });
    const [listed] = await listInvites(db);
    expect(listed).toMatchObject({ state: "used", memo: "김철수", student: { name: "학생" } });
    await expect(signupWithInvite(token, form(`again-${tag}@test.local`))).rejects.toThrow("사용할 수 없는");
  });

  it("동시에 두 번 가입해도 한 명만 만들어진다", async () => {
    const { tag, teacher, db } = await newTeacher();
    const { token } = await issueInvite(db, teacher.id, undefined);
    const results = await Promise.allSettled([signupWithInvite(token, form(`a-${tag}@test.local`)), signupWithInvite(token, form(`b-${tag}@test.local`))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.student.count({ where: { email: { in: [`a-${tag}@test.local`, `b-${tag}@test.local`] } } })).toBe(1);
  });

  it("만료·취소된 링크와 없는 링크는 가입할 수 없다", async () => {
    const { tag, teacher, db } = await newTeacher();
    const { token: expired } = await issueInvite(db, teacher.id, undefined, new Date(Date.now() - 61 * 60 * 1000));
    expect(await checkInvite(expired)).toEqual({ state: "expired" });
    await expect(signupWithInvite(expired, form(`x-${tag}@test.local`))).rejects.toThrow();

    const { token, id } = await issueInvite(db, teacher.id, undefined);
    expect(await revokeInvite(db, id)).toBe(true);
    expect(await revokeInvite(db, id)).toBe(false); // 두 번은 안 됨
    expect(await checkInvite(token)).toEqual({ state: "revoked" });
    await expect(signupWithInvite(token, form(`y-${tag}@test.local`))).rejects.toThrow();

    expect(await checkInvite("A".repeat(43))).toEqual({ state: "invalid" });
    expect(await checkInvite("short")).toEqual({ state: "invalid" });
    expect(await prisma.student.count({ where: { email: { endsWith: `-${tag}@test.local` } } })).toBe(0);
  });

  it("선생님·학생이 쓰는 이메일과 잘못된 입력은 거부하고, 링크는 그대로 남는다", async () => {
    const { tag, teacher, db } = await newTeacher();
    const { token } = await issueInvite(db, teacher.id, undefined);
    await expect(signupWithInvite(token, form(`T-${tag}@test.local`))).rejects.toThrow("이미 가입된");
    await expect(signupWithInvite(token, { ...form(`ok-${tag}@test.local`), confirm: "different" })).rejects.toThrow("서로 다릅니다");
    await expect(signupWithInvite(token, { ...form(`ok-${tag}@test.local`), birthYear: "3000" })).rejects.toThrow("출생연도");
    await expect(signupWithInvite(token, { ...form(`ok-${tag}@test.local`), gender: "X" as "MALE" })).rejects.toThrow("성별");
    await expect(signupWithInvite(token, { ...form(`ok-${tag}@test.local`), agreePrivacy: false as true })).rejects.toThrow("동의해야");
    expect(await checkInvite(token)).toMatchObject({ state: "ok" });
  });

  it("다른 선생님 이름으로 링크를 발급할 수 없다", async () => {
    const a = await newTeacher();
    const b = await newTeacher();
    await expect(issueInvite(b.db, a.teacher.id, undefined)).rejects.toThrow();
  });
});

describe("초대 링크 선생님 간 격리", () => {
  it("다른 선생님의 링크는 목록에 안 보이고 취소할 수 없다", async () => {
    const a = await newTeacher();
    const b = await newTeacher();
    const { id, token } = await issueInvite(a.db, a.teacher.id, "A의 학생");

    expect((await listInvites(b.db)).map((i) => i.id)).not.toContain(id);
    expect(await revokeInvite(b.db, id)).toBe(false);
    expect(await checkInvite(token)).toMatchObject({ state: "ok" });
  });

  it("다른 선생님 이름으로 링크를 발급할 수 없다", async () => {
    const a = await newTeacher();
    const b = await newTeacher();
    await expect(issueInvite(b.db, a.teacher.id, undefined)).rejects.toThrow();
  });
});
