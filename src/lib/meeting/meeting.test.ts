import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { decryptToken, encryptToken } from "./crypto";
import { eventIdOf } from "./google";
import {
  createUpcomingMeetings,
  deleteSlotMeeting,
  disconnectGoogle,
  enterAsStudent,
  enterAsTeacher,
  MeetingError,
  nextTeacherSlot,
  resetTokenCacheForTest,
  saveGoogleConnection,
  saveMeetingSettings,
  setPollDelayForTest,
} from "./meeting";

// 가짜 구글: 토큰 주소와 캘린더 일정 API를 흉내 낸다. 선생님(리프레시 토큰)마다 캘린더가 따로다
type Ev = { id: string; status: string; hangoutLink?: string; attendees: { email: string }[]; start: string };
const google = {
  calendars: new Map<string, Map<string, Ev>>(),
  revoked: new Set<string>(),
  pendingLink: false,
  calls: [] as string[],
  reset() {
    this.calendars.clear();
    this.revoked.clear();
    this.pendingLink = false;
    this.calls = [];
  },
};

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  google.calls.push(`${method} ${url.pathname}`);
  if (url.href.startsWith("https://oauth2.googleapis.com/token")) {
    const p = new URLSearchParams(String(init?.body));
    const rt = p.get("refresh_token")!;
    if (google.revoked.has(rt)) return json(400, { error: "invalid_grant" });
    return json(200, { access_token: `at:${rt}`, expires_in: 3600 });
  }
  if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) {
    google.revoked.add(new URLSearchParams(String(init?.body)).get("token")!);
    return json(200, {});
  }
  const auth = new Headers(init?.headers).get("Authorization")!;
  const cal = google.calendars.get(auth) ?? new Map<string, Ev>();
  google.calendars.set(auth, cal);
  const id = url.pathname.split("/events")[1]?.slice(1);
  if (method === "POST") {
    expect(url.searchParams.get("sendUpdates")).toBe("none"); // 초대 메일 안 보냄 (MEET-03)
    const body = JSON.parse(String(init?.body));
    if (cal.has(body.id)) return json(409, { error: { message: "duplicate" } });
    const ev: Ev = { id: body.id, status: "confirmed", attendees: body.attendees, start: body.start.dateTime };
    if (!google.pendingLink) ev.hangoutLink = `https://meet.google.com/${body.id.slice(-10)}`;
    cal.set(ev.id, ev);
    return json(200, ev);
  }
  const ev = cal.get(id);
  if (!ev) return json(404, { error: { message: "not found" } });
  if (method === "GET") {
    ev.hangoutLink ??= `https://meet.google.com/${ev.id.slice(-10)}`; // 만드는 중이던 회의가 다 만들어짐
    return json(200, ev);
  }
  if (method === "PATCH") {
    Object.assign(ev, JSON.parse(String(init?.body)));
    return json(200, ev);
  }
  if (method === "DELETE") {
    ev.status = "cancelled";
    return new Response(null, { status: 204 });
  }
  return json(400);
}

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.MEETING_TOKEN_KEY = randomBytes(32).toString("base64");
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  setPollDelayForTest(1);
});
beforeEach(() => {
  google.reset();
  resetTokenCacheForTest();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.$disconnect();
});

/** 2027-04-07 19:00 KST */
const NOW = new Date("2027-04-07T10:00:00Z");
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** 선생님 1명(구글 연결 + Google Meet 방식), 학생 3명(s3는 비활성) */
async function tenant({ connect = true } = {}) {
  const tag = randomUUID().slice(0, 8);
  const t = await prisma.teacher.create({ data: { name: "T", email: `tm-${tag}@test.local`, passwordHash: "x" } });
  const db = teacherDb(t.id);
  const student = (n: number, deactivatedAt: Date | null = null) =>
    prisma.student.create({
      data: { teacherId: t.id, name: `S${n}`, birthYear: 1990, gender: "MALE", email: `sm${n}-${tag}@gmail.test`, passwordHash: "x", deactivatedAt },
    });
  const s1 = await student(1);
  const s2 = await student(2);
  const s3 = await student(3, NOW);
  const refreshToken = `rt-${tag}`;
  if (connect) await saveGoogleConnection(db, t.id, { email: `teacher-${tag}@gmail.test`, refreshToken }, NOW);
  const slot = async (startMin: number, lessons: { studentId: string; canceled?: boolean }[]) => {
    const s = await prisma.slot.create({ data: { teacherId: t.id, startsAt: min(startMin), endsAt: min(startMin + 50) } });
    const ids: string[] = [];
    for (const l of lessons) {
      const lesson = await prisma.lesson.create({ data: { teacherId: t.id, slotId: s.id, studentId: l.studentId, canceledAt: l.canceled ? NOW : null } });
      ids.push(lesson.id);
    }
    return { ...s, lessonIds: ids };
  };
  return { t, db, s1, s2, s3, refreshToken, slot, cal: () => google.calendars.get(`Bearer at:${refreshToken}`) ?? new Map<string, Ev>() };
}

const slotRow = (id: string) => prisma.slot.findUniqueOrThrow({ where: { id } });
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof MeetingError ? e.code : String(e)));

describe("토큰 암호화", () => {
  it("암호화한 값은 원래 토큰과 다르고, 되돌리면 같다. 고친 값은 거부한다", () => {
    const enc = encryptToken("1//refresh-token");
    expect(enc).not.toContain("refresh-token");
    expect(decryptToken(enc)).toBe("1//refresh-token");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });

  it("DB에는 암호화해서 저장한다", async () => {
    const x = await tenant();
    const row = await prisma.teacherMeetingAccount.findFirstOrThrow({ where: { teacherId: x.t.id } });
    expect(row.refreshToken).not.toContain(x.refreshToken);
    expect(decryptToken(row.refreshToken)).toBe(x.refreshToken);
    // 처음 연결하면 방식이 Google Meet로 정해진다
    expect((await prisma.teacher.findUniqueOrThrow({ where: { id: x.t.id } })).meetingProvider).toBe("GOOGLE_MEET");
  });
});

describe("수업 10분 전 Meet 링크 (MEET-02, 03, 05)", () => {
  it("10분 안에 시작하고 학생이 있는 슬롯에만 만든다. 참석자는 활성·취소 안 한 학생, 다시 돌려도 또 만들지 않는다", async () => {
    const x = await tenant();
    const soon = await x.slot(10, [{ studentId: x.s1.id }, { studentId: x.s2.id, canceled: true }, { studentId: x.s3.id }]);
    const later = await x.slot(11, [{ studentId: x.s1.id }]);
    const empty = await x.slot(5, [{ studentId: x.s2.id, canceled: true }]);

    await createUpcomingMeetings(x.t.id, NOW);
    const s = await slotRow(soon.id);
    expect(s.meetingProvider).toBe("GOOGLE_MEET");
    expect(s.meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(s.meetingExternalId).toBe(eventIdOf(soon.id));
    expect(x.cal().get(eventIdOf(soon.id))!.attendees).toEqual([{ email: x.s1.email }]);
    expect((await slotRow(later.id)).meetingUrl).toBeNull();
    expect((await slotRow(empty.id)).meetingUrl).toBeNull();

    google.calls = [];
    await createUpcomingMeetings(x.t.id, NOW);
    expect(google.calls.filter((c) => c.startsWith("POST /calendar"))).toEqual([]);
  });

  it("고정 링크 방식이거나 구글을 연결하지 않았으면 만들지 않는다", async () => {
    const x = await tenant();
    await saveMeetingSettings(x.db, x.t.id, { provider: "FIXED_LINK", fixedUrl: "https://zoom.us/j/123?pwd=abc" });
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    await createUpcomingMeetings(x.t.id, NOW);
    expect((await slotRow(a.id)).meetingUrl).toBeNull();

    const y = await tenant({ connect: false });
    await prisma.teacher.update({ where: { id: y.t.id }, data: { meetingProvider: "GOOGLE_MEET" } });
    const b = await y.slot(5, [{ studentId: y.s1.id }]);
    await createUpcomingMeetings(y.t.id, NOW);
    expect((await slotRow(b.id)).meetingUrl).toBeNull();
    expect(google.calls).toEqual([]);
  });

  it("구글에 같은 슬롯 일정이 이미 있으면(저장 전에 꺼진 경우) 새로 만들지 않고 그 일정을 쓴다", async () => {
    const x = await tenant();
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    await createUpcomingMeetings(x.t.id, NOW);
    const first = (await slotRow(a.id)).meetingUrl;
    await prisma.slot.update({ where: { id: a.id }, data: { meetingUrl: null, meetingProvider: null, meetingExternalId: null } });

    await createUpcomingMeetings(x.t.id, NOW);
    expect((await slotRow(a.id)).meetingUrl).toBe(first);
    expect(x.cal().size).toBe(1);
  });

  it("회의가 바로 안 만들어지면 다시 읽어서 링크를 받는다", async () => {
    const x = await tenant();
    google.pendingLink = true;
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    await createUpcomingMeetings(x.t.id, NOW);
    expect((await slotRow(a.id)).meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
  });

  it("구글에서 권한을 취소했으면 연결을 끊는다", async () => {
    const x = await tenant();
    google.revoked.add(x.refreshToken);
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    await createUpcomingMeetings(x.t.id, NOW);
    expect((await slotRow(a.id)).meetingUrl).toBeNull();
    expect(await x.db.teacherMeetingAccount.count()).toBe(0);
  });
});

describe("들어가기 (MEET-04, APP-16)", () => {
  it("학생: 10분 전부터 끝날 때까지만. 링크가 없으면 그때 만든다", async () => {
    const x = await tenant();
    const a = await x.slot(20, [{ studentId: x.s1.id }]);
    const ctx = { db: studentDb(x.t.id, x.s1.id), teacherId: x.t.id };

    expect(await code(enterAsStudent(ctx, a.lessonIds[0], min(9)))).toBe("TOO_EARLY");
    const url = await enterAsStudent(ctx, a.lessonIds[0], min(10));
    expect(url).toBe((await slotRow(a.id)).meetingUrl);
    expect(await enterAsStudent(ctx, a.lessonIds[0], min(69))).toBe(url);
    expect(await code(enterAsStudent(ctx, a.lessonIds[0], min(70)))).toBe("ENDED");
  });

  it("링크를 만든 뒤 들어온 학생은 들어갈 때 참석자로 더한다", async () => {
    const x = await tenant();
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    await createUpcomingMeetings(x.t.id, NOW);
    const late = await prisma.lesson.create({ data: { teacherId: x.t.id, slotId: a.id, studentId: x.s2.id } });

    await enterAsStudent({ db: studentDb(x.t.id, x.s2.id), teacherId: x.t.id }, late.id, NOW);
    expect(x.cal().get(eventIdOf(a.id))!.attendees.map((p) => p.email)).toEqual([x.s1.email, x.s2.email]);
  });

  it("학생은 본인 수업만, 취소한 수업은 못 들어간다", async () => {
    const x = await tenant();
    const a = await x.slot(5, [{ studentId: x.s1.id }, { studentId: x.s2.id, canceled: true }]);
    expect(await code(enterAsStudent({ db: studentDb(x.t.id, x.s2.id), teacherId: x.t.id }, a.lessonIds[0], NOW))).toBe("NOT_FOUND");
    expect(await code(enterAsStudent({ db: studentDb(x.t.id, x.s2.id), teacherId: x.t.id }, a.lessonIds[1], NOW))).toBe("NOT_FOUND");
  });

  it("고정 링크 방식이면 그 링크를 연다. 방식을 안 골랐으면 안내한다", async () => {
    const x = await tenant({ connect: false });
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    const ctx = { db: studentDb(x.t.id, x.s1.id), teacherId: x.t.id };
    expect(await code(enterAsStudent(ctx, a.lessonIds[0], NOW))).toBe("NOT_READY");

    await saveMeetingSettings(x.db, x.t.id, { provider: "FIXED_LINK", fixedUrl: " https://zoom.us/j/123?pwd=abc " });
    expect(await enterAsStudent(ctx, a.lessonIds[0], NOW)).toBe("https://zoom.us/j/123?pwd=abc");
    expect(await enterAsTeacher(x.t.id, a.id, NOW)).toBe("https://zoom.us/j/123?pwd=abc");
    expect((await slotRow(a.id)).meetingUrl).toBeNull();
  });

  it("Google Meet 방식인데 연결이 없으면 안내한다", async () => {
    const x = await tenant({ connect: false });
    await saveMeetingSettings(x.db, x.t.id, { provider: "GOOGLE_MEET", fixedUrl: "" });
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    expect(await code(enterAsTeacher(x.t.id, a.id, NOW))).toBe("NOT_READY");
  });

  it("선생님 카드: 학생이 있는 다음 수업. 학생 없는 수업에는 들어가지 않는다", async () => {
    const x = await tenant();
    const empty = await x.slot(5, [{ studentId: x.s2.id, canceled: true }]);
    const a = await x.slot(60, [{ studentId: x.s1.id }, { studentId: x.s3.id }]);
    expect(await nextTeacherSlot(x.t.id, NOW)).toMatchObject({ id: a.id, names: ["S1"] });
    expect(await code(enterAsTeacher(x.t.id, empty.id, NOW))).toBe("NO_STUDENTS");
  });
});

describe("설정·연결", () => {
  it("고정 링크는 https만", async () => {
    const x = await tenant({ connect: false });
    await expect(saveMeetingSettings(x.db, x.t.id, { provider: "FIXED_LINK", fixedUrl: "http://zoom.us/j/1" })).rejects.toThrow("https");
    await expect(saveMeetingSettings(x.db, x.t.id, { provider: "FIXED_LINK", fixedUrl: "" })).rejects.toThrow("붙여 넣어");
    await expect(saveMeetingSettings(x.db, x.t.id, { provider: "ZOOM", fixedUrl: "" })).rejects.toThrow("방식");
  });

  it("연결을 끊으면 구글 권한도 취소하고, 다시 연결하면 같은 줄을 되살린다", async () => {
    const x = await tenant();
    await disconnectGoogle(x.db);
    expect(google.revoked.has(x.refreshToken)).toBe(true);
    expect(await x.db.teacherMeetingAccount.count()).toBe(0);

    await saveGoogleConnection(x.db, x.t.id, { email: "new@gmail.test", refreshToken: "rt-new" });
    const rows = await prisma.teacherMeetingAccount.findMany({ where: { teacherId: x.t.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountEmail: "new@gmail.test", deletedAt: null });
  });
});

describe("슬롯 삭제 (MEET-07)", () => {
  it("구글 일정도 지운다. 이미 지워졌으면 그냥 넘어간다", async () => {
    const x = await tenant();
    const a = await x.slot(5, [{ studentId: x.s1.id }]);
    await createUpcomingMeetings(x.t.id, NOW);
    const s = await slotRow(a.id);
    await deleteSlotMeeting(x.t.id, s);
    expect(x.cal().get(eventIdOf(a.id))!.status).toBe("cancelled");
    x.cal().delete(eventIdOf(a.id));
    await expect(deleteSlotMeeting(x.t.id, s)).resolves.toBeUndefined();
  });
});

describe("선생님 간 격리", () => {
  it("A의 스케줄러는 B 슬롯에 링크를 만들지 않고, B 캘린더도 쓰지 않는다", async () => {
    const A = await tenant();
    const B = await tenant();
    const b = await B.slot(5, [{ studentId: B.s1.id }]);
    await createUpcomingMeetings(A.t.id, NOW);
    expect((await slotRow(b.id)).meetingUrl).toBeNull();
    expect(google.calendars.has(`Bearer at:${B.refreshToken}`)).toBe(false);
  });

  it("A 선생님·A 학생은 B 슬롯·B 수업에 들어갈 수 없다", async () => {
    const A = await tenant();
    const B = await tenant();
    const b = await B.slot(5, [{ studentId: B.s1.id }]);
    expect(await code(enterAsTeacher(A.t.id, b.id, NOW))).toBe("NOT_FOUND");
    expect(await code(enterAsStudent({ db: studentDb(A.t.id, A.s1.id), teacherId: A.t.id }, b.lessonIds[0], NOW))).toBe("NOT_FOUND");
    expect(google.calls).toEqual([]);
  });

  it("A의 연결 정보는 B 범위·학생 범위에서 안 보인다", async () => {
    const A = await tenant();
    const B = await tenant();
    expect(await B.db.teacherMeetingAccount.findMany()).toHaveLength(1);
    expect((await B.db.teacherMeetingAccount.findMany())[0].teacherId).toBe(B.t.id);
    expect(await studentDb(A.t.id, A.s1.id).teacherMeetingAccount.findMany()).toEqual([]);
    const t = await studentDb(A.t.id, A.s1.id).teacher.findFirst({ include: { meetingAccounts: true } });
    expect(t!.meetingAccounts).toEqual([]);
  });

  it("A가 연결을 끊어도 B 연결은 그대로", async () => {
    const A = await tenant();
    const B = await tenant();
    await disconnectGoogle(A.db);
    expect(await B.db.teacherMeetingAccount.count()).toBe(1);
  });
});
