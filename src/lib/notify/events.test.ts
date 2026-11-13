import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { addComment, createPost } from "@/lib/board/board";
import { prisma } from "@/lib/db/client";
import { studentDb, studentDbByTeacher, teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import { bookSlot, cancelLesson, moveLesson, type StudentCtx } from "@/lib/schedule/student";
import { deleteSlot } from "@/lib/schedule/teacher";
import { notifyBoardComment, notifyBoardPost, notifyScheduleChange, notifySlotDeleted } from "./events";
import { sendWeeklyMissing } from "./scheduled";

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

/** 12/10(목) 12:00 KST */
const NOW = kstToUtc(2026, 12, 10, 12 * 60);
const at = (day: number, hour: number) => kstToUtc(2026, 12, day, hour * 60);

/** 선생님 1명, 학생 2명, 모두 기기 1개씩 */
async function tenant() {
  const tag = randomUUID().slice(0, 8);
  const t = await prisma.teacher.create({ data: { name: "T", email: `tev-${tag}@test.local`, passwordHash: "x" } });
  const student = (n: number) =>
    prisma.student.create({ data: { teacherId: t.id, name: `S${n}`, birthYear: 1990, gender: "MALE", email: `sev${n}-${tag}@test.local`, passwordHash: "x" } });
  const s1 = await student(1);
  const s2 = await student(2);
  const device = async (who: string, studentId: string | null) => {
    const endpoint = `https://push.test/${tag}-${who}`;
    await prisma.pushSubscription.create({ data: { teacherId: t.id, studentId, endpoint, p256dh: "p", auth: "a" } });
    return endpoint;
  };
  const ep = { t: await device("t", null), s1: await device("s1", s1.id), s2: await device("s2", s2.id) };
  const slot = async (startsAt: Date, studentIds: string[]) => {
    const s = await prisma.slot.create({ data: { teacherId: t.id, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) } });
    const lessons = [];
    for (const studentId of studentIds) lessons.push(await prisma.lesson.create({ data: { teacherId: t.id, slotId: s.id, studentId } }));
    return { ...s, lessons };
  };
  /** 이력이 가리킬 학생 고정 일정 */
  const weekly = async (studentId: string) => {
    const ws = await prisma.weeklySlot.create({ data: { teacherId: t.id, weekday: 2, startMinute: 19 * 60, endMinute: 20 * 60 } });
    return (await prisma.weeklyLesson.create({ data: { teacherId: t.id, studentId, weeklySlotId: ws.id } })).id;
  };
  const asStudent = (id: string): StudentCtx => ({ db: studentDb(t.id, id), teacherId: t.id, studentId: id });
  const asTeacher = (id: string, reason: string): StudentCtx => ({ db: studentDbByTeacher(t.id, id), teacherId: t.id, studentId: id, byTeacher: true, reason });
  return { t, s1, s2, ep, slot, weekly, asStudent, asTeacher };
}

const sentTo = () => send.mock.calls.map((c) => c[0].endpoint).sort();
const bodies = () => send.mock.calls.map((c) => JSON.parse(c[1] as string) as { title: string; body: string; url: string });
const logs = (teacherId: string) => prisma.notificationLog.findMany({ where: { teacherId }, select: { kind: true, targetKey: true, recipient: true } });

describe("학생이 일정을 바꾸면 선생님에게 (NOTI-02)", () => {
  it("취소하면 선생님에게 한 번 보낸다. 다시 불러도 또 보내지 않는다", async () => {
    const x = await tenant();
    const s = await x.slot(at(12, 19), [x.s1.id]);
    const { changeIds } = await cancelLesson(x.asStudent(x.s1.id), s.lessons[0].id, NOW);

    await notifyScheduleChange(x.t.id, x.s1.id, changeIds, NOW);
    expect(sentTo()).toEqual([x.ep.t]);
    expect(bodies()[0]).toEqual({ title: "S1 학생이 일정을 바꿨어요", body: "취소: 12/12(토) 19:00", url: `/admin/students/${x.s1.id}` });
    expect(await logs(x.t.id)).toEqual([{ kind: "SCHEDULE_CHANGED", targetKey: changeIds[0], recipient: "TEACHER" }]);

    send.mockClear();
    await notifyScheduleChange(x.t.id, x.s1.id, changeIds, NOW);
    expect(send).not.toHaveBeenCalled();
  });

  it("새로 예약해도 선생님에게 보낸다", async () => {
    const x = await tenant();
    const s = await x.slot(at(12, 19), []);
    const { changeIds } = await bookSlot(x.asStudent(x.s1.id), s.id, NOW);
    await notifyScheduleChange(x.t.id, x.s1.id, changeIds, NOW);
    expect(sentTo()).toEqual([x.ep.t]);
    expect(bodies()[0]).toEqual({ title: "S1 학생이 일정을 바꿨어요", body: "예약: 12/12(토) 19:00", url: `/admin/students/${x.s1.id}` });
  });

  it("옮기면 전과 후를 적는다", async () => {
    const x = await tenant();
    const from = await x.slot(at(12, 19), [x.s1.id]);
    const to = await x.slot(at(13, 10), []);
    const { changeIds } = await moveLesson(x.asStudent(x.s1.id), from.lessons[0].id, to.id, NOW);
    await notifyScheduleChange(x.t.id, x.s1.id, changeIds, NOW);
    expect(bodies()[0].body).toBe("옮김: 12/12(토) 19:00 → 12/13(일) 10:00");
  });

  it("고정 일정 변경 여러 줄은 알림 하나로 보낸다", async () => {
    const x = await tenant();
    const db = studentDb(x.t.id, x.s1.id);
    const ids = [];
    for (const data of [
      { action: "CHANGE", beforeText: "매주 화 19:00~20:00", afterText: "매주 목 19:00~20:00" },
      { action: "REMOVE", beforeText: "매주 토 10:00~11:00" },
      { action: "ADD", afterText: "매주 일 10:00~11:00" },
    ]) {
      ids.push((await db.scheduleChange.create({ data: { ...data, weeklyLessonId: await x.weekly(x.s1.id) } as never })).id);
    }
    await notifyScheduleChange(x.t.id, x.s1.id, ids, NOW);
    expect(send).toHaveBeenCalledTimes(1);
    expect(bodies()[0].body).toBe(
      ["고정 일정 변경: 매주 화 19:00~20:00 → 매주 목 19:00~20:00", "고정 일정 빼기: 매주 토 10:00~11:00", "고정 일정 추가: 매주 일 10:00~11:00"].join("\n"),
    );
  });
});

describe("선생님이 학생 일정을 바꾸면 그 학생에게 (NOTI-07)", () => {
  it("사유와 함께 그 학생에게만 보낸다", async () => {
    const x = await tenant();
    const s = await x.slot(at(12, 19), [x.s1.id, x.s2.id]);
    const { changeIds } = await cancelLesson(x.asTeacher(x.s1.id, "선생님 병원"), s.lessons[0].id, NOW);
    await notifyScheduleChange(x.t.id, x.s1.id, changeIds, NOW);
    expect(sentTo()).toEqual([x.ep.s1]);
    expect(bodies()[0]).toEqual({ title: "선생님이 수업 일정을 바꿨어요", body: "취소: 12/12(토) 19:00\n사유: 선생님 병원", url: "/lessons" });
    expect(await logs(x.t.id)).toEqual([{ kind: "TEACHER_CHANGED", targetKey: changeIds[0], recipient: x.s1.id }]);
  });
});

describe("슬롯 삭제 (NOTI-03)", () => {
  it("예약했던 학생들에게 보낸다. 취소한 학생은 빼고, 선생님에게는 안 보낸다", async () => {
    const x = await tenant();
    const s = await x.slot(at(12, 19), [x.s1.id, x.s2.id]);
    await prisma.lesson.update({ where: { id: s.lessons[1].id }, data: { canceledAt: NOW } });
    const { slot, studentIds } = await deleteSlot(teacherDb(x.t.id), s.id, NOW);

    await notifySlotDeleted(x.t.id, slot, studentIds, NOW);
    expect(sentTo()).toEqual([x.ep.s1]);
    expect(bodies()[0]).toMatchObject({ title: "수업이 취소됐어요", url: "/book" });
    expect(bodies()[0].body).toContain("12/12(토) 19:00");
    send.mockClear();
    await notifySlotDeleted(x.t.id, slot, studentIds, NOW);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("게시판 (NOTI-05)", () => {
  it("학생 글은 선생님에게, 선생님 댓글은 그 학생에게 간다", async () => {
    const x = await tenant();
    const post = await createPost({ db: studentDb(x.t.id, x.s1.id), role: "student", studentId: x.s1.id }, null, { title: "질문", content: "내용" });
    await notifyBoardPost(x.t.id, post.id, NOW);
    expect(sentTo()).toEqual([x.ep.t]);
    expect(bodies()[0]).toEqual({ title: "S1 학생이 새 글을 올렸어요", body: "질문", url: `/board/${post.id}` });

    send.mockClear();
    const long = "가".repeat(100);
    const c = await addComment({ db: teacherDb(x.t.id), role: "teacher" }, post.id, long);
    await notifyBoardComment(x.t.id, c.id, NOW);
    expect(sentTo()).toEqual([x.ep.s1]);
    expect(bodies()[0]).toEqual({ title: "선생님이 댓글을 달았어요", body: `${"가".repeat(80)}…`, url: `/board/${post.id}` });
  });

  it("선생님 글은 그 학생에게만, 학생 댓글은 선생님에게 간다", async () => {
    const x = await tenant();
    const post = await createPost({ db: teacherDb(x.t.id), role: "teacher" }, x.s2.id, { title: "숙제", content: "내용" });
    await notifyBoardPost(x.t.id, post.id, NOW);
    expect(sentTo()).toEqual([x.ep.s2]);

    send.mockClear();
    const c = await addComment({ db: studentDb(x.t.id, x.s2.id), role: "student", studentId: x.s2.id }, post.id, "네");
    await notifyBoardComment(x.t.id, c.id, NOW);
    expect(sentTo()).toEqual([x.ep.t]);
    expect(bodies()[0].title).toBe("S2 학생이 댓글을 달았어요");
  });
});

describe("고정 일정 누락 (NOTI-06)", () => {
  type X = Awaited<ReturnType<typeof tenant>>;
  async function removed(x: X, studentId: string, beforeText: string, createdAt: Date, changedBy: "SYSTEM" | "STUDENT" | "TEACHER" = "SYSTEM") {
    const weeklyLessonId = await x.weekly(studentId);
    await prisma.scheduleChange.create({ data: { teacherId: x.t.id, studentId, weeklyLessonId, action: "REMOVE", beforeText, changedBy, createdAt } });
  }

  it("월말 생성에서 끝난 고정 일정을 학생마다 한 번에 모아 보낸다. 다시 돌려도 또 보내지 않는다", async () => {
    const x = await tenant();
    const genAt = kstToUtc(2026, 12, 31, 0);
    await removed(x, x.s1.id, "매주 화 19:00~20:00", genAt);
    await removed(x, x.s1.id, "매주 목 19:00~20:00", genAt);

    // 생성 직후 서버가 멈췄다가 몇 시간 뒤에 다시 떠도 보낸다
    const later = new Date(genAt.getTime() + 5 * 60 * 60_000);
    await sendWeeklyMissing(x.t.id, later);
    expect(sentTo()).toEqual([x.ep.s1]);
    expect(bodies()[0]).toEqual({
      title: "고정 수업 일부가 없어졌어요",
      body: "선생님 수업 시간이 바뀌어 1월부터 매주 화 19:00~20:00, 매주 목 19:00~20:00 수업이 잡히지 않아요. 다른 시간을 골라 주세요.",
      url: "/lessons/weekly",
    });
    send.mockClear();
    await sendWeeklyMissing(x.t.id, new Date(later.getTime() + 60_000));
    expect(send).not.toHaveBeenCalled();
  });

  it("2일보다 오래된 기록, 학생·선생님이 남긴 기록은 보내지 않는다", async () => {
    const x = await tenant();
    await removed(x, x.s1.id, "매주 화 19:00~20:00", new Date(NOW.getTime() - 3 * 24 * 60 * 60_000));
    const hourAgo = new Date(NOW.getTime() - 60 * 60_000);
    await removed(x, x.s2.id, "매주 화 19:00~20:00", hourAgo, "STUDENT");
    await removed(x, x.s2.id, "매주 목 19:00~20:00", hourAgo, "TEACHER");
    await sendWeeklyMissing(x.t.id, NOW);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("선생님 간 격리, 푸시 키", () => {
  it("다른 선생님 id로는 이력·글·댓글을 읽지 못해 아무에게도 안 보낸다", async () => {
    const A = await tenant();
    const B = await tenant();
    const s = await A.slot(at(12, 19), [A.s1.id]);
    const { changeIds } = await cancelLesson(A.asStudent(A.s1.id), s.lessons[0].id, NOW);
    const post = await createPost({ db: studentDb(A.t.id, A.s1.id), role: "student", studentId: A.s1.id }, null, { title: "q", content: "c" });
    const c = await addComment({ db: teacherDb(A.t.id), role: "teacher" }, post.id, "a");

    await notifyScheduleChange(B.t.id, A.s1.id, changeIds, NOW);
    await notifyBoardPost(B.t.id, post.id, NOW);
    await notifyBoardComment(B.t.id, c.id, NOW);
    await notifySlotDeleted(B.t.id, s, [A.s1.id], NOW);
    expect(send).not.toHaveBeenCalled();
    expect(await logs(A.t.id)).toEqual([]);
  });

  it("푸시 키가 없으면 보내지도 기록하지도 않는다", async () => {
    const x = await tenant();
    const s = await x.slot(at(12, 19), [x.s1.id]);
    const { changeIds } = await cancelLesson(x.asStudent(x.s1.id), s.lessons[0].id, NOW);
    delete process.env.WEBPUSH_VAPID_PRIVATE_KEY;
    await notifyScheduleChange(x.t.id, x.s1.id, changeIds, NOW);
    expect(send).not.toHaveBeenCalled();
    expect(await logs(x.t.id)).toEqual([]);
  });
});
