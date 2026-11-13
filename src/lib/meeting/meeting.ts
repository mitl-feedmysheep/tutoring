import type { MeetingProvider } from "@/generated/prisma/client";
import { teacherDb, type ScopedDb } from "@/lib/db/scope";
import { listTeacherIds } from "@/lib/db/teachers";
import { decryptToken, encryptToken, tokenKeyConfigured } from "./crypto";
import {
  ALLOWED_ORIGINS,
  createEvent,
  deleteEvent,
  eventIdOf,
  getEvent,
  googleClientConfigured,
  GoogleError,
  meetLinkOf,
  patchEvent,
  refreshAccessToken,
  revokeToken,
  type Connection,
  type GoogleEvent,
} from "./google";

// 화상 수업 (MEET). 선생님이 고른 방식에 따라 "들어가기" 링크를 정한다.
// - GOOGLE_MEET: 선생님 구글 캘린더에 슬롯마다 일정 + Meet 링크를 만들어 slot에 저장 (수업 10분 전 스케줄러, 아니면 처음 들어갈 때)
// - FIXED_LINK: 선생님이 붙여 넣은 링크 하나를 모든 수업에서 연다 (slot에는 저장하지 않음)
// teacherId는 항상 서버 세션 또는 스케줄러의 선생님 목록에서 온다

/** 들어가기는 수업 시작 10분 전부터 끝날 때까지 (APP-16). Meet 링크도 이때 만든다 (MEET-05) */
export const ENTER_BEFORE_MS = 10 * 60_000;

export type MeetingErrorCode = "NOT_FOUND" | "TOO_EARLY" | "ENDED" | "NOT_READY" | "NO_STUDENTS" | "DISCONNECTED" | "FAILED";

export class MeetingError extends Error {
  constructor(readonly code: MeetingErrorCode) {
    super(code);
    this.name = "MeetingError";
  }
}

/** 화면에 보여 줄 안내. 선생님에게는 고칠 곳을 알려 준다 */
export function meetingErrorText(code: MeetingErrorCode, role: "teacher" | "student") {
  const teacher = role === "teacher";
  switch (code) {
    case "NOT_FOUND":
      return "수업을 찾을 수 없어요";
    case "TOO_EARLY":
      return "10분 전부터 들어갈 수 있어요";
    case "ENDED":
      return "이미 끝난 수업이에요";
    case "NO_STUDENTS":
      return "참여하는 학생이 없는 수업이에요";
    case "NOT_READY":
      return teacher ? "어드민 > 화상 수업에서 방식을 정해 주세요" : "선생님이 화상 수업을 아직 준비하지 않았어요";
    case "DISCONNECTED":
      return teacher ? "구글 연결이 끊겼어요. 어드민 > 화상 수업에서 다시 연결해 주세요" : "선생님 구글 연결이 끊겼어요. 선생님께 알려 주세요";
    case "FAILED":
      return "수업 링크를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요";
  }
}

/** 구글 Meet 자동을 쓸 수 있는 서버인지 (OAuth 클라이언트 + 토큰 암호화 키) */
export function googleMeetConfigured() {
  return googleClientConfigured() && tokenKeyConfigured();
}

// ─── 설정 (MEET-06, MEET-01) ─────────────────────────────────────

export async function meetingSettings(db: ScopedDb, teacherId: string) {
  const [teacher, google] = await Promise.all([
    db.teacher.findUnique({ where: { id: teacherId }, select: { meetingProvider: true, meetingFixedUrl: true } }),
    db.teacherMeetingAccount.findFirst({ where: { provider: "GOOGLE" }, select: { accountEmail: true, connectedAt: true } }),
  ]);
  return {
    provider: teacher?.meetingProvider ?? null,
    fixedUrl: teacher?.meetingFixedUrl ?? null,
    google: google && { email: google.accountEmail, connectedAt: google.connectedAt },
  };
}

/** 고정 링크: https 주소만. 반환값은 저장할 값 (빈 칸이면 null) */
export function parseFixedUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new MeetingSettingsError("링크를 다시 확인해 주세요 (https://로 시작)");
  }
  if (url.protocol !== "https:") throw new MeetingSettingsError("https://로 시작하는 링크만 쓸 수 있어요");
  if (v.length > 500) throw new MeetingSettingsError("링크가 너무 길어요");
  return url.toString();
}

export class MeetingSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingSettingsError";
  }
}

/** 방식과 고정 링크 저장. 고정 링크는 방식을 바꿔도 남겨 둔다 (다시 고를 때 편하게) */
export async function saveMeetingSettings(db: ScopedDb, teacherId: string, input: { provider: string; fixedUrl: string }) {
  const provider = input.provider as MeetingProvider;
  if (provider !== "GOOGLE_MEET" && provider !== "FIXED_LINK") throw new MeetingSettingsError("방식을 골라 주세요");
  if (provider === "GOOGLE_MEET") {
    // 고정 링크 칸은 숨겨져 있으니 그 값 때문에 저장이 막히지 않게 한다. 링크는 바꾸지 않는다
    await db.teacher.update({ where: { id: teacherId }, data: { meetingProvider: provider } });
    return;
  }
  const fixedUrl = parseFixedUrl(input.fixedUrl);
  if (!fixedUrl) throw new MeetingSettingsError("고정 링크를 붙여 넣어 주세요");
  await db.teacher.update({ where: { id: teacherId }, data: { meetingProvider: provider, meetingFixedUrl: fixedUrl } });
}

/** 구글 연결 저장. 끊었던 행이 있으면 되살린다 (선생님당 한 줄) */
export async function saveGoogleConnection(db: ScopedDb, teacherId: string, conn: Pick<Connection, "email" | "refreshToken">, now = new Date()) {
  const data = { accountEmail: conn.email, refreshToken: encryptToken(conn.refreshToken), connectedAt: now };
  const restored = await db.teacherMeetingAccount.updateMany({ where: { provider: "GOOGLE", deletedAt: { not: null } }, data: { ...data, deletedAt: null } });
  if (!restored.count) {
    const updated = await db.teacherMeetingAccount.updateMany({ where: { provider: "GOOGLE" }, data });
    if (!updated.count) await db.teacherMeetingAccount.create({ data: { provider: "GOOGLE", ...data } as never });
  }
  // 연결하면 방식을 Google Meet로 (아직 안 골랐을 때만)
  await db.teacher.updateMany({ where: { id: teacherId, meetingProvider: null }, data: { meetingProvider: "GOOGLE_MEET" } });
}

/** 연결 끊기. 구글에도 권한 취소를 요청한다. 이미 만든 Meet 링크는 그대로 쓸 수 있다 */
export async function disconnectGoogle(db: ScopedDb, now = new Date()) {
  const account = await db.teacherMeetingAccount.findFirst({ where: { provider: "GOOGLE" }, select: { id: true, refreshToken: true } });
  if (!account) return;
  await db.teacherMeetingAccount.update({ where: { id: account.id }, data: { deletedAt: now } });
  tokenCache.delete(account.id);
  try {
    await revokeToken(decryptToken(account.refreshToken));
  } catch (e) {
    console.error("[meeting] 구글 권한 취소 실패", e);
  }
}

// ─── 액세스 토큰 ──────────────────────────────────────────────────

/** 계정 id → 액세스 토큰. 다시 연결하면(connectedAt이 바뀌면) 새로 받는다 */
const tokenCache = new Map<string, { connectedAt: number; accessToken: string; expiresAt: number }>();

export function resetTokenCacheForTest() {
  tokenCache.clear();
}

/** 연결이 없으면 null. 구글에서 권한을 취소했으면 연결을 끊고 DISCONNECTED */
async function accessToken(db: ScopedDb): Promise<string | null> {
  const account = await db.teacherMeetingAccount.findFirst({ where: { provider: "GOOGLE" }, select: { id: true, refreshToken: true, connectedAt: true } });
  if (!account) return null;
  const cached = tokenCache.get(account.id);
  if (cached && cached.connectedAt === account.connectedAt.getTime() && cached.expiresAt - 60_000 > Date.now()) return cached.accessToken;
  try {
    const t = await refreshAccessToken(decryptToken(account.refreshToken));
    tokenCache.set(account.id, { connectedAt: account.connectedAt.getTime(), ...t });
    return t.accessToken;
  } catch (e) {
    if (e instanceof GoogleError && e.revoked) {
      console.error("[meeting] 구글 권한이 취소되어 연결을 끊습니다", e.message);
      await db.teacherMeetingAccount.updateMany({ where: { id: account.id }, data: { deletedAt: new Date() } });
      tokenCache.delete(account.id);
      throw new MeetingError("DISCONNECTED");
    }
    throw e;
  }
}

// ─── 슬롯 Meet 링크 (MEET-02, 03, 05) ────────────────────────────

const ACTIVE_LESSON = { canceledAt: null, deletedAt: null, student: { deactivatedAt: null, deletedAt: null } };

async function slotForMeeting(db: ScopedDb, slotId: string) {
  const slot = await db.slot.findUnique({
    where: { id: slotId },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      meetingProvider: true,
      meetingUrl: true,
      meetingExternalId: true,
      lessons: { where: ACTIVE_LESSON, select: { student: { select: { email: true } } } },
    },
  });
  if (!slot) return null;
  return { ...slot, emails: slot.lessons.map((l) => l.student.email) };
}

/** 회의 정보가 바로 안 나오면(만드는 중) 잠깐 기다렸다 다시 읽는다 */
let pollDelayMs = 1000;
export function setPollDelayForTest(ms: number) {
  pollDelayMs = ms;
}

async function waitForLink(token: string, event: GoogleEvent): Promise<string | null> {
  let e = event;
  for (let i = 0; i < 3 && !meetLinkOf(e); i++) {
    await new Promise((r) => setTimeout(r, pollDelayMs));
    e = await getEvent(token, event.id);
  }
  return meetLinkOf(e);
}

/** 참석자에 빠진 학생을 더한다 (링크를 만든 뒤 들어온 학생). 빼지는 않는다 */
async function addMissingAttendees(token: string, event: GoogleEvent, emails: string[]) {
  const have = new Set((event.attendees ?? []).map((a) => a.email.toLowerCase()));
  const missing = emails.filter((e) => !have.has(e.toLowerCase()));
  if (missing.length === 0) return;
  await patchEvent(token, event.id, { attendees: [...(event.attendees ?? []), ...missing.map((email) => ({ email }))] });
}

/** 일정을 만든다. 이미 있으면(같은 슬롯 id, 409) 그 일정을 쓴다. 지워진 일정이면 되살린다 */
async function createOrReuseEvent(token: string, slot: NonNullable<Awaited<ReturnType<typeof slotForMeeting>>>): Promise<GoogleEvent> {
  try {
    return await createEvent(token, { slotId: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, attendees: slot.emails, appUrl: ALLOWED_ORIGINS[0] });
  } catch (e) {
    if (!(e instanceof GoogleError && e.status === 409)) throw e;
  }
  let event = await getEvent(token, eventIdOf(slot.id));
  if (event.status === "cancelled") event = await patchEvent(token, event.id, { status: "confirmed" });
  await addMissingAttendees(token, event, slot.emails);
  return event;
}

/**
 * 슬롯의 Google Meet 링크. 없으면 만들어 저장하고, 있으면 빠진 학생만 참석자로 더한다.
 * 참여 학생이 없으면 만들지 않는다 (MEET-05)
 */
export async function ensureGoogleMeeting(teacherId: string, slotId: string): Promise<string> {
  const db = teacherDb(teacherId);
  const slot = await slotForMeeting(db, slotId);
  if (!slot) throw new MeetingError("NOT_FOUND");
  if (slot.emails.length === 0) throw new MeetingError("NO_STUDENTS");

  const token = await accessToken(db);
  if (slot.meetingProvider === "GOOGLE_MEET" && slot.meetingUrl && slot.meetingExternalId) {
    if (token) {
      try {
        await addMissingAttendees(token, await getEvent(token, slot.meetingExternalId), slot.emails);
      } catch (e) {
        // 참석자 추가가 안 돼도 링크는 연다 (승인을 받고 들어오면 된다)
        console.error("[meeting] 참석자 추가 실패", e);
      }
    }
    return slot.meetingUrl;
  }

  if (!token) throw new MeetingError("NOT_READY");
  let link: string | null;
  let eventId: string;
  try {
    const event = await createOrReuseEvent(token, slot);
    eventId = event.id;
    link = await waitForLink(token, event);
  } catch (e) {
    if (e instanceof MeetingError) throw e;
    console.error("[meeting] Meet 링크 만들기 실패", e);
    throw new MeetingError("FAILED");
  }
  if (!link) throw new MeetingError("FAILED");

  // 동시에 두 명이 눌러도 일정 id가 같아서 링크도 같다. 먼저 저장된 값을 덮지 않는다
  await db.slot.updateMany({
    where: { id: slot.id, OR: [{ meetingUrl: null }, { meetingProvider: { not: "GOOGLE_MEET" } }] },
    data: { meetingProvider: "GOOGLE_MEET", meetingUrl: link, meetingExternalId: eventId },
  });
  return link;
}

// ─── 들어가기 (MEET-04, APP-16) ──────────────────────────────────

function checkWindow(slot: { startsAt: Date; endsAt: Date }, now: Date) {
  if (now.getTime() < slot.startsAt.getTime() - ENTER_BEFORE_MS) throw new MeetingError("TOO_EARLY");
  if (now >= slot.endsAt) throw new MeetingError("ENDED");
}

async function urlForSlot(teacherId: string, slot: { id: string; startsAt: Date; endsAt: Date }, now: Date) {
  checkWindow(slot, now);
  const teacher = await teacherDb(teacherId).teacher.findUnique({ where: { id: teacherId }, select: { meetingProvider: true, meetingFixedUrl: true } });
  if (teacher?.meetingProvider === "FIXED_LINK") {
    if (!teacher.meetingFixedUrl) throw new MeetingError("NOT_READY");
    return teacher.meetingFixedUrl;
  }
  if (teacher?.meetingProvider === "GOOGLE_MEET") {
    if (!googleMeetConfigured()) throw new MeetingError("NOT_READY");
    return ensureGoogleMeeting(teacherId, slot.id);
  }
  throw new MeetingError("NOT_READY");
}

/** 학생: 본인 수업(취소 안 함)만. db는 세션에서 만든 studentDb */
export async function enterAsStudent(ctx: { db: ScopedDb; teacherId: string }, lessonId: string, now = new Date()) {
  const lesson = await ctx.db.lesson.findFirst({
    where: { id: lessonId, canceledAt: null, slot: { deletedAt: null } },
    select: { slot: { select: { id: true, startsAt: true, endsAt: true } } },
  });
  if (!lesson) throw new MeetingError("NOT_FOUND");
  return urlForSlot(ctx.teacherId, lesson.slot, now);
}

/** 선생님: 본인 슬롯만 (teacherDb 범위) */
export async function enterAsTeacher(teacherId: string, slotId: string, now = new Date()) {
  const slot = await teacherDb(teacherId).slot.findUnique({ where: { id: slotId }, select: { id: true, startsAt: true, endsAt: true } });
  if (!slot) throw new MeetingError("NOT_FOUND");
  return urlForSlot(teacherId, slot, now);
}

/** 선생님 수업 탭 다음 수업: 참여 학생이 있고 끝나지 않은 첫 슬롯 (MEET-04) */
export async function nextTeacherSlot(teacherId: string, now = new Date()) {
  const slot = await teacherDb(teacherId).slot.findFirst({
    where: { endsAt: { gt: now }, lessons: { some: ACTIVE_LESSON } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, endsAt: true, lessons: { where: ACTIVE_LESSON, orderBy: { createdAt: "asc" }, select: { student: { select: { name: true } } } } },
  });
  return slot && { id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, names: slot.lessons.map((l) => l.student.name) };
}

// ─── 스케줄러, 슬롯 삭제 ─────────────────────────────────────────

/** MEET-05: 10분 안에 시작하고 참여 학생이 있는데 링크가 없는 슬롯에 만든다. Google Meet 방식 + 연결된 선생님만 */
export async function createUpcomingMeetings(teacherId: string, now: Date) {
  const db = teacherDb(teacherId);
  const teacher = await db.teacher.findUnique({ where: { id: teacherId }, select: { meetingProvider: true } });
  if (teacher?.meetingProvider !== "GOOGLE_MEET") return;
  if (!(await db.teacherMeetingAccount.count({ where: { provider: "GOOGLE" } }))) return;
  const slots = await db.slot.findMany({
    where: { startsAt: { gt: now, lte: new Date(now.getTime() + ENTER_BEFORE_MS) }, meetingUrl: null, lessons: { some: ACTIVE_LESSON } },
    select: { id: true },
    orderBy: { startsAt: "asc" },
  });
  for (const { id } of slots) {
    try {
      await ensureGoogleMeeting(teacherId, id);
    } catch (e) {
      console.error(`[meeting] 미리 만들기 실패 slot=${id}`, e);
      if (e instanceof MeetingError && e.code === "DISCONNECTED") return;
    }
  }
}

/** 스케줄러가 1분마다 부른다. 설정이 없는 서버(로컬 등)에서는 돌지 않는다 */
export async function runScheduledMeetings(now = new Date()) {
  if (!googleMeetConfigured()) return;
  for (const teacherId of await listTeacherIds()) {
    try {
      await createUpcomingMeetings(teacherId, now);
    } catch (e) {
      console.error(`[meeting] 스케줄러 실패 teacher=${teacherId}`, e);
    }
  }
}

/** MEET-07: 지운 슬롯의 구글 일정도 지운다. 연결이 없거나 다른 계정이면 건너뛴다 */
export async function deleteSlotMeeting(teacherId: string, slot: { meetingProvider: MeetingProvider | null; meetingExternalId: string | null }) {
  if (slot.meetingProvider !== "GOOGLE_MEET" || !slot.meetingExternalId || !googleMeetConfigured()) return;
  const token = await accessToken(teacherDb(teacherId));
  if (!token) return;
  await deleteEvent(token, slot.meetingExternalId);
}
