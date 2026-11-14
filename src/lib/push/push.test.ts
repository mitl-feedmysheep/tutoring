import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { prisma } from "@/lib/db/client";
import type { SessionClaims } from "@/lib/auth/token";
import { ScheduleError } from "@/lib/schedule/teacher";
import { isPushSubscribed, removePushSubscription, savePushSubscription, sendPush, sendTestPush } from "./push";

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
const send = vi.mocked(webpush.sendNotification);

beforeAll(() => {
  process.env.WEBPUSH_VAPID_PUBLIC_KEY = "pub";
  process.env.WEBPUSH_VAPID_PRIVATE_KEY = "priv";
  process.env.WEBPUSH_VAPID_SUBJECT = "https://tutoring.test";
});
beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
});
afterAll(() => prisma.$disconnect());

async function tenant() {
  const tag = randomUUID().slice(0, 8);
  const t = await prisma.teacher.create({ data: { name: "T", email: `tpu-${tag}@test.local`, passwordHash: "x" } });
  const student = (n: number) =>
    prisma.student.create({
      data: { teacherId: t.id, name: `S${n}`, birthYear: 1990, gender: "MALE", email: `spu${n}-${tag}@test.local`, passwordHash: "x" },
    });
  const s1 = await student(1);
  const s2 = await student(2);
  const teacher: SessionClaims = { role: "teacher", teacherId: t.id, v: 0 };
  const as = (studentId: string): SessionClaims => ({ role: "student", teacherId: t.id, studentId, v: 0 });
  return { t, s1, s2, teacher, st1: as(s1.id), st2: as(s2.id) };
}

const sub = (endpoint = `https://push.test/${randomUUID()}`) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });
const row = (endpoint: string) => prisma.pushSubscription.findUnique({ where: { endpoint } });
const sentTo = () => send.mock.calls.map((c) => c[0].endpoint).sort();
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

describe("구독 저장·끄기", () => {
  it("켜면 세션의 주인으로 저장되고, 끄면 지워지고, 다시 켜면 같은 행을 되살린다", async () => {
    const { t, s1, st1 } = await tenant();
    const s = sub();
    await savePushSubscription(st1, s, "iPhone");
    const first = await row(s.endpoint);
    expect(first).toMatchObject({ teacherId: t.id, studentId: s1.id, userAgent: "iPhone", deletedAt: null });
    expect(await isPushSubscribed(st1, s.endpoint)).toBe(true);

    await removePushSubscription(st1, s.endpoint);
    expect((await row(s.endpoint))!.deletedAt).not.toBeNull();
    expect(await isPushSubscribed(st1, s.endpoint)).toBe(false);

    await savePushSubscription(st1, { ...s, keys: { p256dh: "p2", auth: "a2" } }, null);
    expect(await row(s.endpoint)).toMatchObject({ id: first!.id, p256dh: "p2", deletedAt: null });
  });

  it("선생님 기기는 student_id 없이 저장된다", async () => {
    const { teacher } = await tenant();
    const s = sub();
    await savePushSubscription(teacher, s, null);
    expect((await row(s.endpoint))!.studentId).toBeNull();
    expect(await isPushSubscribed(teacher, s.endpoint)).toBe(true);
  });

  it("같은 기기에서 다른 사람(다른 선생님의 학생 포함)이 켜면 그 사람 것으로 옮긴다", async () => {
    const A = await tenant();
    const B = await tenant();
    const s = sub();
    await savePushSubscription(A.st1, s, null);
    await savePushSubscription(B.st2, s, null);
    expect(await row(s.endpoint)).toMatchObject({ teacherId: B.t.id, studentId: B.s2.id });
    expect(await isPushSubscribed(A.st1, s.endpoint)).toBe(false);
    expect(await isPushSubscribed(B.st2, s.endpoint)).toBe(true);
  });

  it("남의 기기 구독은 끄거나 확인할 수 없다", async () => {
    const A = await tenant();
    const B = await tenant();
    const s = sub();
    await savePushSubscription(A.st1, s, null);
    await removePushSubscription(A.st2, s.endpoint); // 같은 선생님의 다른 학생
    await removePushSubscription(A.teacher, s.endpoint); // 선생님도 학생 기기는 못 끈다
    await removePushSubscription(B.st1, s.endpoint); // 다른 선생님의 학생
    await removePushSubscription(B.teacher, s.endpoint);
    expect((await row(s.endpoint))!.deletedAt).toBeNull();
    expect(await isPushSubscribed(A.st2, s.endpoint)).toBe(false);
    expect(await isPushSubscribed(A.teacher, s.endpoint)).toBe(false);
    expect(await isPushSubscribed(B.teacher, s.endpoint)).toBe(false);
  });

  it("잘못된 구독 값은 거절한다", async () => {
    const { st1 } = await tenant();
    await err(savePushSubscription(st1, { endpoint: "http://push.test/x", keys: { p256dh: "p", auth: "a" } }, null), "잘못된 요청이에요");
    await err(savePushSubscription(st1, { endpoint: "https://push.test/x" }, null), "잘못된 요청이에요");
    await err(savePushSubscription(st1, sub(`https://push.test/${"x".repeat(800)}`), null), "잘못된 요청이에요");
    await err(savePushSubscription(st1, "x", null), "잘못된 요청이에요");
    await err(removePushSubscription(st1, 1), "잘못된 요청이에요");
  });
});

describe("보내기", () => {
  it("고른 사람 기기에만 보내고, 비활성 학생·꺼진 기기·다른 선생님 학생은 빠진다", async () => {
    const A = await tenant();
    const B = await tenant();
    const [a1, a1b, a2, at, off, b1] = Array.from({ length: 6 }, () => sub());
    await savePushSubscription(A.st1, a1, null);
    await savePushSubscription(A.st1, a1b, null); // 학생 기기 두 대
    await savePushSubscription(A.st2, a2, null);
    await savePushSubscription(A.teacher, at, null);
    await savePushSubscription(A.st1, off, null);
    await removePushSubscription(A.st1, off.endpoint);
    await savePushSubscription(B.st1, b1, null);

    expect(await sendPush(A.t.id, { studentIds: [A.s1.id, B.s1.id] }, { title: "수업 30분 전" })).toBe(2);
    expect(sentTo()).toEqual([a1.endpoint, a1b.endpoint].sort());
    expect(JSON.parse(send.mock.calls[0][1] as string)).toEqual({ title: "수업 30분 전", url: "/" });

    send.mockClear();
    expect(await sendPush(A.t.id, { teacher: true }, { title: "t", url: "/board" })).toBe(1);
    expect(sentTo()).toEqual([at.endpoint]);

    send.mockClear();
    await prisma.student.update({ where: { id: A.s2.id }, data: { deactivatedAt: new Date() } });
    expect(await sendPush(A.t.id, { studentIds: [A.s2.id] }, { title: "x" })).toBe(0);
    expect(await sendPush(A.t.id, {}, { title: "x" })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("없어진 구독(410)은 지우고, 다른 실패는 오류 없이 넘어간다", async () => {
    const { t, s1, st1 } = await tenant();
    const gone = sub();
    const flaky = sub();
    await savePushSubscription(st1, gone, null);
    await savePushSubscription(st1, flaky, null);
    send.mockImplementation(async (s) => {
      throw Object.assign(new Error("x"), { statusCode: s.endpoint === gone.endpoint ? 410 : 500 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPush(t.id, { studentIds: [s1.id] }, { title: "x" })).toBe(0);
    expect((await row(gone.endpoint))!.deletedAt).not.toBeNull();
    expect((await row(flaky.endpoint))!.deletedAt).toBeNull();
  });

  it("시험 알림은 선생님 본인 이 기기에만 간다. 학생은 보낼 수 없다", async () => {
    const { teacher, st1 } = await tenant();
    const mine = sub();
    const studentDevice = sub();
    await savePushSubscription(teacher, mine, null);
    await savePushSubscription(st1, studentDevice, null);
    expect(await sendTestPush(teacher, mine.endpoint)).toBe(1);
    expect(sentTo()).toEqual([mine.endpoint]);
    await err(sendTestPush(teacher, studentDevice.endpoint), "이 기기 알림이 꺼져 있어요");
    await err(sendTestPush(st1, studentDevice.endpoint), "시험 알림은 선생님만 보낼 수 있어요");
  });
});
