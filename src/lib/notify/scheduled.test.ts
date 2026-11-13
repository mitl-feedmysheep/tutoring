import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { prisma } from "@/lib/db/client";
import { teacherDb } from "@/lib/db/scope";
import { runScheduledNotifications, sendLessonReminders, sendStudyReminders } from "./scheduled";
import { claimNotification } from "./send";

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
const send = vi.mocked(webpush.sendNotification);

const KEYS = { WEBPUSH_VAPID_PUBLIC_KEY: "pub", WEBPUSH_VAPID_PRIVATE_KEY: "priv", WEBPUSH_VAPID_SUBJECT: "https://tutoring.test" };
beforeAll(() => Object.assign(process.env, KEYS));
beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
});
afterEach(() => Object.assign(process.env, KEYS));
afterAll(() => prisma.$disconnect());

/** 2027-03-10 19:00 KST */
const NOW = new Date("2027-03-10T10:00:00Z");
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** 선생님 1명, 학생 3명(s3는 비활성), 모두 기기 1개씩 */
async function tenant() {
  const tag = randomUUID().slice(0, 8);
  const t = await prisma.teacher.create({ data: { name: "T", email: `tno-${tag}@test.local`, passwordHash: "x" } });
  const student = (n: number, deactivatedAt: Date | null = null) =>
    prisma.student.create({
      data: { teacherId: t.id, name: `S${n}`, birthYear: 1990, gender: "MALE", email: `sno${n}-${tag}@test.local`, passwordHash: "x", deactivatedAt },
    });
  const s1 = await student(1);
  const s2 = await student(2);
  const s3 = await student(3, NOW);
  const device = async (who: string, studentId: string | null) => {
    const endpoint = `https://push.test/${tag}-${who}`;
    await prisma.pushSubscription.create({ data: { teacherId: t.id, studentId, endpoint, p256dh: "p", auth: "a" } });
    return endpoint;
  };
  const ep = { t: await device("t", null), s1: await device("s1", s1.id), s2: await device("s2", s2.id), s3: await device("s3", s3.id) };
  const slot = async (startMin: number, lessons: { studentId: string; canceled?: boolean }[]) => {
    const s = await prisma.slot.create({ data: { teacherId: t.id, startsAt: min(startMin), endsAt: min(startMin + 60) } });
    for (const l of lessons) {
      await prisma.lesson.create({ data: { teacherId: t.id, slotId: s.id, studentId: l.studentId, canceledAt: l.canceled ? NOW : null } });
    }
    return s;
  };
  return { t, s1, s2, s3, ep, slot };
}

const sentTo = () => send.mock.calls.map((c) => c[0].endpoint).sort();
const bodies = () => send.mock.calls.map((c) => JSON.parse(c[1] as string) as { title: string; body: string; url: string });
const logs = (teacherId: string) => prisma.notificationLog.findMany({ where: { teacherId }, orderBy: { createdAt: "asc" } });

describe("수업 30분 전 알림 (NOTI-01)", () => {
  it("30분 안에 시작하는 수업의 선생님과 참여 학생에게 보낸다. 취소한 학생·비활성 학생은 빼고, 다시 돌려도 또 보내지 않는다", async () => {
    const x = await tenant();
    const slot = await x.slot(30, [{ studentId: x.s1.id }, { studentId: x.s2.id, canceled: true }, { studentId: x.s3.id }]);

    await sendLessonReminders(x.t.id, NOW);
    expect(sentTo()).toEqual([x.ep.t, x.ep.s1].sort());
    const teacherMsg = bodies().find((_, i) => send.mock.calls[i][0].endpoint === x.ep.t)!;
    expect(teacherMsg).toMatchObject({ title: "곧 수업이 시작돼요", body: "19:30 수업이 30분 뒤에 시작돼요 · S1", url: "/" });
    expect((await logs(x.t.id)).map((l) => [l.kind, l.targetKey, l.recipient]).sort()).toEqual(
      [
        ["LESSON_REMINDER", slot.id, "TEACHER"],
        ["LESSON_REMINDER", slot.id, x.s1.id],
      ].sort(),
    );

    send.mockClear();
    await sendLessonReminders(x.t.id, min(1));
    expect(send).not.toHaveBeenCalled();
  });

  it("30분보다 뒤 수업, 이미 시작한 수업, 참여 학생이 없는 수업은 보내지 않는다", async () => {
    const x = await tenant();
    await x.slot(31, [{ studentId: x.s1.id }]);
    await x.slot(0, [{ studentId: x.s1.id }]);
    await x.slot(-10, [{ studentId: x.s1.id }]);
    await x.slot(20, [{ studentId: x.s2.id, canceled: true }]);
    await sendLessonReminders(x.t.id, NOW);
    expect(send).not.toHaveBeenCalled();
    expect(await logs(x.t.id)).toEqual([]);
  });

  it("배포로 놓쳤으면 다시 떴을 때 남은 시간으로 보낸다", async () => {
    const x = await tenant();
    await x.slot(30, [{ studentId: x.s1.id }]);
    await sendLessonReminders(x.t.id, min(25));
    expect(sentTo()).toEqual([x.ep.t, x.ep.s1].sort());
    expect(bodies()[0].body).toContain("5분 뒤에 시작돼요");
  });

  it("나중에 들어온 학생은 따로 받고, 선생님은 다시 받지 않는다", async () => {
    const x = await tenant();
    const slot = await x.slot(30, [{ studentId: x.s1.id }]);
    await sendLessonReminders(x.t.id, NOW);
    send.mockClear();
    await prisma.lesson.create({ data: { teacherId: x.t.id, slotId: slot.id, studentId: x.s2.id } });
    await sendLessonReminders(x.t.id, min(5));
    expect(sentTo()).toEqual([x.ep.s2]);
  });
});

describe("밤 11시 공부 기록 알림 (NOTI-04)", () => {
  /** 2027-03-10 KST의 시:분 */
  const kst = (h: number, m = 0) => new Date(Date.UTC(2027, 2, 10, h - 9, m));

  it("11시 전에는 보내지 않고, 11시가 지나면 오늘 기록이 없는 활성 학생에게 하루 한 번 보낸다", async () => {
    const x = await tenant();
    await prisma.studyLog.create({ data: { teacherId: x.t.id, studentId: x.s1.id, studyDate: new Date("2027-03-10"), minutes: 30 } });
    // 지운 기록은 없는 것으로 친다, 선생님 본인 기록은 상관없다
    await prisma.studyLog.create({ data: { teacherId: x.t.id, studentId: x.s2.id, studyDate: new Date("2027-03-10"), minutes: 30, deletedAt: NOW } });
    await prisma.studyLog.create({ data: { teacherId: x.t.id, studentId: x.s2.id, studyDate: new Date("2027-03-09"), minutes: 30 } });

    await sendStudyReminders(x.t.id, kst(22, 59));
    expect(send).not.toHaveBeenCalled();

    await sendStudyReminders(x.t.id, kst(23, 3));
    expect(sentTo()).toEqual([x.ep.s2]);
    expect(bodies()[0]).toMatchObject({ title: "오늘 공부 기록이 아직 없어요", url: "/study/2027-03-10" });
    expect((await logs(x.t.id)).map((l) => [l.kind, l.targetKey, l.recipient])).toEqual([["STUDY_MISSING", "2027-03-10", x.s2.id]]);

    send.mockClear();
    await sendStudyReminders(x.t.id, kst(23, 40));
    expect(send).not.toHaveBeenCalled();

    // 다음 날 밤에는 다시 (s1도 그날 기록이 없음)
    await sendStudyReminders(x.t.id, new Date(kst(23, 0).getTime() + 24 * 60 * 60_000));
    expect(sentTo()).toEqual([x.ep.s1, x.ep.s2].sort());
  });

  it("자정이 지나면 전날 알림은 보내지 않는다", async () => {
    const x = await tenant();
    await sendStudyReminders(x.t.id, new Date(Date.UTC(2027, 2, 10, 15, 5))); // 3/11 00:05 KST
    expect(send).not.toHaveBeenCalled();
  });
});

describe("발송 기록과 격리", () => {
  it("같은 알림은 한 번만 기록된다", async () => {
    const x = await tenant();
    const db = teacherDb(x.t.id);
    expect(await claimNotification(db, "BOARD", "k", "TEACHER")).toBe(true);
    expect(await claimNotification(db, "BOARD", "k", "TEACHER")).toBe(false);
    expect(await claimNotification(db, "BOARD", "k", x.s1.id)).toBe(true);
  });

  it("다른 선생님의 같은 키와 섞이지 않고, 다른 선생님 범위에서는 기록이 안 보인다", async () => {
    const A = await tenant();
    const B = await tenant();
    expect(await claimNotification(teacherDb(A.t.id), "BOARD", "same", "TEACHER")).toBe(true);
    expect(await claimNotification(teacherDb(B.t.id), "BOARD", "same", "TEACHER")).toBe(true);
    expect((await teacherDb(A.t.id).notificationLog.findMany()).every((l) => l.teacherId === A.t.id)).toBe(true);
  });

  it("한 선생님 알림은 그 선생님과 그 학생들 기기에만 간다", async () => {
    const A = await tenant();
    const B = await tenant();
    await A.slot(20, [{ studentId: A.s1.id }]);
    await B.slot(20, [{ studentId: B.s1.id }]);
    await sendLessonReminders(A.t.id, NOW);
    expect(sentTo()).toEqual([A.ep.t, A.ep.s1].sort());
  });

  it("푸시 키가 없으면 기록도 남기지 않는다 (로컬 개발 서버가 운영 알림을 가로채지 않게)", async () => {
    const x = await tenant();
    await x.slot(20, [{ studentId: x.s1.id }]);
    delete process.env.WEBPUSH_VAPID_PRIVATE_KEY;
    await runScheduledNotifications(NOW);
    expect(send).not.toHaveBeenCalled();
    expect(await logs(x.t.id)).toEqual([]);
  });
});
