import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { SessionClaims } from "@/lib/auth/token";
import { secret } from "@/lib/auth/token";
import { studentDb, teacherDb, type ScopedDb } from "@/lib/db/scope";
import { cleanNote, NOTE_MAX } from "@/lib/lessons/note-text";
import { addMonths, dateKey, kstParts, monthDate, type YearMonth } from "@/lib/schedule/kst";
import { isUniqueError } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { r2, type Storage } from "@/lib/storage/r2";
import { DAY_MAX_MINUTES, ENTRY_MAX_MINUTES, MINUTE_STEP, PHOTO_MAX, PHOTO_MAX_BYTES, PHOTO_TYPE } from "./rules";

// 공부 기록 (STUDY-01~04, 06~08). 하루 여러 건, 오늘·어제만 쓰고 고친다.
// 주인(owner)은 학생 본인(studentDb) 또는 선생님 본인(teacherDb + studentId NULL, STUDY-08).
// 선생님이 학생 기록을 볼 때(STUDY-06)는 teacherDb + 그 학생 id로 읽기만 한다

export type StudyOwner = { db: ScopedDb; teacherId: string; studentId: string | null };

/** 웹앱 로그인 정보로 내 공부 기록의 주인을 만든다. 값은 서버 세션에서 나온 것만 */
export function studyOwnerOf(claims: SessionClaims): StudyOwner {
  if (claims.role === "student") return { db: studentDb(claims.teacherId, claims.studentId), teacherId: claims.teacherId, studentId: claims.studentId };
  return { db: teacherDb(claims.teacherId), teacherId: claims.teacherId, studentId: null };
}

const ID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60_000;

// ── 날짜 ("2026-11-13" = KST 날짜. DATE 컬럼에는 그날 UTC 0시로 들어간다)

export function todayKey(now = new Date()) {
  const p = kstParts(now);
  return dateKey(p.year, p.month, p.day);
}

/** STUDY-02: 쓰고 고칠 수 있는 날 (오늘, 어제) */
export function editableDates(now = new Date()) {
  return [todayKey(now), todayKey(new Date(now.getTime() - DAY_MS))];
}

/**
 * 임시 (2026-11-14): 선생님 본인 기록(STUDY-08)은 이날부터 쓰고 고칠 수 있다. 앱을 쓰기 전 공부 기록을 옮겨 넣으려고 연다.
 * 다 넣으면 이 변경(커밋)을 되돌려 오늘·어제만 쓰는 규칙(STUDY-02)으로 돌아간다
 */
const TEACHER_BACKFILL_FROM = "2026-10-30";

/** 이 주인이 그날 기록을 쓰고 고칠 수 있는지 */
export function canEditDate(owner: Pick<StudyOwner, "studentId">, date: string, now = new Date()) {
  if (editableDates(now).includes(date)) return true;
  return owner.studentId === null && date >= TEACHER_BACKFILL_FROM && date <= todayKey(now);
}

export const toDbDate = (key: string) => new Date(`${key}T00:00:00Z`);
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

function addDays(key: string, n: number) {
  return fromDbDate(new Date(toDbDate(key).getTime() + n * DAY_MS));
}

/** a부터 b까지 며칠 (같은 날이면 1) */
function daysInclusive(a: string, b: string) {
  return Math.round((toDbDate(b).getTime() - toDbDate(a).getTime()) / DAY_MS) + 1;
}

// ── 사진 올리기 (STUDY-07). 서버가 파일 id·키를 정하고 서명한 표를 준다. 브라우저는 서명 URL로 R2에 바로 올리고, 저장할 때 표를 돌려준다

const UPLOAD_AUD = "study-upload";

/** 파일 id를 서버에서 미리 정한다 (DB 기본값과 같은 UUID v7) */
export function uuidv7() {
  const b = randomBytes(16);
  const ts = BigInt(Date.now());
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & BigInt(0xff));
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const photoKey = (teacherId: string, fileId: string) => `teachers/${teacherId}/STUDY_PHOTO/${fileId}.jpg`;

/** 사진 count장을 올릴 서명 URL과 표 */
export async function prepareUploads(owner: StudyOwner, count: unknown, storage: Storage = r2) {
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > PHOTO_MAX) throw new ScheduleError("잘못된 요청이에요");
  return Promise.all(
    Array.from({ length: count }, async () => {
      const id = uuidv7();
      const key = photoKey(owner.teacherId, id);
      const token = await new SignJWT({ id, t: owner.teacherId, s: owner.studentId })
        .setProtectedHeader({ alg: "HS256" })
        .setAudience(UPLOAD_AUD)
        .setIssuedAt()
        .setExpirationTime("3h")
        .sign(secret());
      return { token, url: await storage.uploadUrl(key, PHOTO_TYPE) };
    }),
  );
}

/** 표가 이 주인에게 발급한 것인지. 다른 사람 표, 고친 표, 만료된 표는 거절 */
async function readUploadToken(owner: StudyOwner, token: string) {
  try {
    const { payload: p } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: UPLOAD_AUD });
    if (typeof p.id === "string" && ID.test(p.id) && p.t === owner.teacherId && p.s === owner.studentId) return p.id;
  } catch {
    // 아래에서 거절
  }
  throw new ScheduleError("사진을 다시 올려 주세요");
}

// ── 저장·삭제

const photoInput = z.union([z.object({ fileId: z.string().regex(ID) }).strict(), z.object({ token: z.string().min(1).max(2000) }).strict()]);

const saveInput = z
  .object({
    id: z.string().regex(ID).nullish(),
    date: z.string().regex(DATE),
    minutes: z.number().int(),
    memo: z.string(),
    photos: z.array(photoInput).max(PHOTO_MAX),
  })
  .strict();

export type SaveStudyInput = z.infer<typeof saveInput>;

function checkEditable(owner: StudyOwner, date: string, now: Date) {
  if (!canEditDate(owner, date, now)) throw new ScheduleError("어제 기록까지만 고칠 수 있어요");
}

function checkMinutes(minutes: number) {
  if (minutes <= 0) throw new ScheduleError("공부 시간을 적어 주세요");
  if (minutes % MINUTE_STEP !== 0 || minutes > ENTRY_MAX_MINUTES) throw new ScheduleError("공부 시간은 5분 단위로 12시간까지 적을 수 있어요");
}

/** STUDY-01, 02, 07: 기록 저장. id가 없으면 새로 만든다. photos는 보여 줄 순서대로 (남길 사진 id 또는 새로 올린 사진 표) */
export async function saveStudyLog(owner: StudyOwner, raw: unknown, now = new Date(), storage: Storage = r2): Promise<{ id: string }> {
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) throw new ScheduleError("잘못된 요청이에요");
  const input = parsed.data;
  checkEditable(owner, input.date, now);
  checkMinutes(input.minutes);
  const memo = cleanNote(input.memo);
  if (memo.length > NOTE_MAX) throw new ScheduleError(`내용은 ${NOTE_MAX.toLocaleString()}자까지 쓸 수 있어요`);

  // 새 사진: 표 확인 → R2에 실제로 올라갔는지, 형식·크기 확인
  const photos = await Promise.all(
    input.photos.map(async (p) => {
      if ("fileId" in p) return { fileId: p.fileId, upload: null };
      const fileId = await readUploadToken(owner, p.token);
      const key = photoKey(owner.teacherId, fileId);
      const head = await storage.head(key);
      if (!head) throw new ScheduleError("사진을 올리지 못했어요. 다시 올려 주세요");
      if (head.contentType !== PHOTO_TYPE || head.size <= 0 || head.size > PHOTO_MAX_BYTES) throw new ScheduleError("올릴 수 없는 사진이에요");
      return { fileId, upload: { key, size: head.size } };
    }),
  );
  if (new Set(photos.map((p) => p.fileId)).size !== photos.length) throw new ScheduleError("잘못된 요청이에요");

  const studyDate = toDbDate(input.date);
  const studentId = owner.studentId;
  try {
    return await owner.db.$transaction(async (tx) => {
      let logId: string;
      if (input.id) {
        const log = await tx.studyLog.findFirst({ where: { id: input.id, studentId }, select: { id: true, studyDate: true } });
        if (!log) throw new ScheduleError("없는 기록이에요");
        // 날짜는 바꾸지 않는다. 그저께 기록을 오늘 날짜로 보내 고치는 것도 막힌다
        if (fromDbDate(log.studyDate) !== input.date) throw new ScheduleError("잘못된 요청이에요");
        await tx.studyLog.updateMany({ where: { id: log.id }, data: { minutes: input.minutes, memo: memo || null } });
        logId = log.id;
      } else {
        // teacher_id(학생이면 student_id도)는 범위 계층이 채운다
        const log = await tx.studyLog.create({ data: { studentId, studyDate, minutes: input.minutes, memo: memo || null } as never, select: { id: true } });
        logId = log.id;
      }

      const day = await tx.studyLog.aggregate({ where: { studentId, studyDate }, _sum: { minutes: true } });
      if ((day._sum.minutes ?? 0) > DAY_MAX_MINUTES) throw new ScheduleError("하루 공부 시간은 24시간을 넘을 수 없어요");

      const current = new Set((await tx.file.findMany({ where: { studyLogId: logId }, select: { id: true } })).map((f) => f.id));
      const keep = new Set(photos.filter((p) => !p.upload).map((p) => p.fileId));
      for (const id of keep) if (!current.has(id)) throw new ScheduleError("없는 사진이에요");
      const removed = [...current].filter((id) => !keep.has(id));
      if (removed.length) await tx.file.updateMany({ where: { id: { in: removed } }, data: { deletedAt: now } });

      for (const [i, p] of photos.entries()) {
        if (!p.upload) {
          await tx.file.updateMany({ where: { id: p.fileId }, data: { sortOrder: i } });
          continue;
        }
        await tx.file.create({
          data: {
            id: p.fileId,
            kind: "STUDY_PHOTO",
            uploaderStudentId: studentId,
            studyLogId: logId,
            fileName: `${p.fileId}.jpg`,
            r2Key: p.upload.key,
            contentType: PHOTO_TYPE,
            sizeBytes: p.upload.size,
            sortOrder: i,
          } as never,
        });
      }
      return { id: logId };
    });
  } catch (e) {
    // 같은 표로 두 번 저장 (파일 id가 겹침)
    if (isUniqueError(e)) throw new ScheduleError("이미 저장한 사진이에요. 화면을 새로 고쳐 주세요");
    throw e;
  }
}

/** 기록 지우기 (오늘·어제만). 사진도 같이 지운 것으로 표시한다. R2 파일은 남긴다 */
export async function deleteStudyLog(owner: StudyOwner, id: unknown, now = new Date()) {
  if (typeof id !== "string" || !ID.test(id)) throw new ScheduleError("잘못된 요청이에요");
  const log = await owner.db.studyLog.findFirst({ where: { id, studentId: owner.studentId }, select: { id: true, studyDate: true } });
  if (!log) throw new ScheduleError("없는 기록이에요");
  checkEditable(owner, fromDbDate(log.studyDate), now);
  await owner.db.$transaction(async (tx) => {
    await tx.file.updateMany({ where: { studyLogId: log.id }, data: { deletedAt: now } });
    await tx.studyLog.updateMany({ where: { id: log.id }, data: { deletedAt: now } });
  });
}

// ── 읽기

const logSelect = {
  id: true,
  studyDate: true,
  minutes: true,
  memo: true,
  photos: { select: { id: true, r2Key: true }, orderBy: { sortOrder: "asc" } },
} as const;

export type StudyEntry = { id: string; date: string; minutes: number; memo: string; photos: { id: string; url: string }[] };

async function toEntries(rows: { id: string; studyDate: Date; minutes: number; memo: string | null; photos: { id: string; r2Key: string }[] }[], storage: Storage) {
  return Promise.all(
    rows.map(
      async (r): Promise<StudyEntry> => ({
        id: r.id,
        date: fromDbDate(r.studyDate),
        minutes: r.minutes,
        memo: r.memo ?? "",
        photos: await Promise.all(r.photos.map(async (p) => ({ id: p.id, url: await storage.viewUrl(p.r2Key) }))),
      }),
    ),
  );
}

/** 그날 기록 (쓴 순서대로) */
export async function dayEntries(owner: StudyOwner, date: string, storage: Storage = r2) {
  const rows = await owner.db.studyLog.findMany({
    where: { studentId: owner.studentId, studyDate: toDbDate(date) },
    orderBy: { createdAt: "asc" },
    select: logSelect,
  });
  return toEntries(rows, storage);
}

/** 그 달 기록 (최근 날짜부터, 같은 날은 쓴 순서대로) */
export async function monthEntries(owner: StudyOwner, ym: YearMonth, storage: Storage = r2) {
  const rows = await owner.db.studyLog.findMany({
    where: { studentId: owner.studentId, studyDate: { gte: monthDate(ym), lt: monthDate(addMonths(ym, 1)) } },
    orderBy: [{ studyDate: "desc" }, { createdAt: "asc" }],
    select: logSelect,
  });
  return toEntries(rows, storage);
}

export type StudyTotal = { minutes: number; studiedDays: number; days: number };

/**
 * STUDY-04, APP-03: 이번 주(일요일부터) / 이번 달 / 누적 합계와 "days일 중 studiedDays일".
 * 분모는 오늘까지 지난 날 수. 가입한 날보다 앞은 세지 않는다 (가입 전날 "어제" 기록이 있으면 그날부터)
 */
export async function studySummary(owner: StudyOwner, now = new Date()) {
  const [groups, since] = await Promise.all([
    owner.db.studyLog.groupBy({ by: ["studyDate"], where: { studentId: owner.studentId }, _sum: { minutes: true } }),
    ownerSince(owner),
  ]);
  const today = todayKey(now);
  const days = groups.map((g) => ({ key: fromDbDate(g.studyDate), minutes: g._sum.minutes ?? 0 })).filter((d) => d.key <= today);
  const first = days.reduce((min, d) => (d.key < min ? d.key : min), since < today ? since : today);

  const total = (start: string): StudyTotal => {
    const from = start > first ? start : first;
    const inRange = days.filter((d) => d.key >= from);
    return { minutes: inRange.reduce((s, d) => s + d.minutes, 0), studiedDays: inRange.filter((d) => d.minutes > 0).length, days: daysInclusive(from, today) };
  };
  const p = kstParts(now);
  return { week: total(addDays(today, -p.weekday)), month: total(dateKey(p.year, p.month, 1)), all: total(first) };
}

/** 가입한 날 (KST) */
async function ownerSince(owner: StudyOwner) {
  const row = owner.studentId
    ? await owner.db.student.findFirst({ where: { id: owner.studentId }, select: { createdAt: true } })
    : await owner.db.teacher.findFirst({ where: { id: owner.teacherId }, select: { createdAt: true } });
  return todayKey(row?.createdAt ?? new Date());
}
