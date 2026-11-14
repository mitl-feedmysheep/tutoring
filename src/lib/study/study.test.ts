import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { kstToUtc } from "@/lib/schedule/kst";
import { ScheduleError } from "@/lib/schedule/teacher";
import type { Storage } from "@/lib/storage/r2";
import { PHOTO_MAX, PHOTO_MAX_BYTES } from "./rules";
import {
  dayEntries,
  deleteStudyLog,
  canEditDate,
  editableDates,
  monthEntries,
  prepareUploads,
  saveStudyLog,
  studySummary,
  toDbDate,
  type StudyOwner,
} from "./study";

afterAll(() => prisma.$disconnect());

const NOW = kstToUtc(2026, 12, 10, 0 * 60 + 30); // 12/10(목) 00:30 KST. 새벽이라 어제(12/9)도 고칠 수 있다
const TODAY = "2026-12-10";
const YESTERDAY = "2026-12-09";
const err = (p: Promise<unknown>, message: string) => expect(p).rejects.toThrow(new ScheduleError(message));

/** 가짜 R2. uploaded()로 올린 것처럼 만든다 */
function fakeStorage() {
  const objects = new Map<string, { size: number; contentType: string }>();
  const urls: string[] = [];
  const storage: Storage = {
    uploadUrl: async (key) => {
      urls.push(key);
      return `https://upload/${key}`;
    },
    viewUrl: async (key) => `https://view/${key}`,
    head: async (key) => objects.get(key) ?? null,
  };
  return {
    storage,
    /** 마지막으로 서명한 키들을 올린 것으로 */
    uploadAll: (size = 1000, contentType = "image/jpeg") => urls.splice(0).forEach((k) => objects.set(k, { size, contentType })),
  };
}

async function newTeacher(createdAt?: Date) {
  return prisma.teacher.create({ data: { name: "T", email: `ts-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x", createdAt } });
}

async function newStudent(teacherId: string, createdAt?: Date) {
  return prisma.student.create({
    data: { teacherId, name: "S", birthYear: 1990, gender: "FEMALE", email: `ss-${randomUUID().slice(0, 8)}@test.local`, passwordHash: "x", createdAt },
  });
}

const studentOwner = (teacherId: string, studentId: string): StudyOwner => ({ db: studentDb(teacherId, studentId), teacherId, studentId });
const teacherOwner = (teacherId: string): StudyOwner => ({ db: teacherDb(teacherId), teacherId, studentId: null });

async function setup(createdAt?: Date) {
  const t = await newTeacher(createdAt);
  const s = await newStudent(t.id, createdAt);
  return { t, s, me: studentOwner(t.id, s.id), teacher: teacherOwner(t.id) };
}

const rawLogs = (teacherId: string) =>
  prisma.studyLog.findMany({ where: { teacherId }, orderBy: { createdAt: "asc" }, select: { studentId: true, studyDate: true, minutes: true, memo: true, deletedAt: true } });

const rawFiles = (studyLogId: string) =>
  prisma.file.findMany({ where: { studyLogId }, orderBy: { sortOrder: "asc" }, select: { id: true, r2Key: true, sortOrder: true, uploaderStudentId: true, deletedAt: true, sizeBytes: true } });

const input = (over: Record<string, unknown> = {}) => ({ date: TODAY, minutes: 30, memo: "- 쉐도잉", photos: [], ...over });

describe("오늘·어제", () => {
  it("KST 기준 오늘과 어제", () => {
    expect(editableDates(NOW)).toEqual([TODAY, YESTERDAY]);
    expect(editableDates(kstToUtc(2026, 12, 1, 9 * 60))).toEqual(["2026-12-01", "2026-11-30"]);
  });
});

describe("기록 쓰기 (STUDY-01, 02)", () => {
  it("오늘·어제에 하루 여러 건 쓰고 고친다. 내용은 노트처럼 정리한다", async () => {
    const { t, s, me } = await setup();
    const a = await saveStudyLog(me, input({ memo: "- 쉐도잉\n- " }), NOW);
    await saveStudyLog(me, input({ minutes: 45, memo: "" }), NOW);
    await saveStudyLog(me, input({ date: YESTERDAY, minutes: 60 }), NOW);
    await saveStudyLog(me, input({ id: a.id, minutes: 35, memo: "- 고침" }), NOW);

    expect(await rawLogs(t.id)).toEqual([
      { studentId: s.id, studyDate: toDbDate(TODAY), minutes: 35, memo: "- 고침", deletedAt: null },
      { studentId: s.id, studyDate: toDbDate(TODAY), minutes: 45, memo: null, deletedAt: null },
      { studentId: s.id, studyDate: toDbDate(YESTERDAY), minutes: 60, memo: "- 쉐도잉", deletedAt: null },
    ]);
    expect((await dayEntries(me, TODAY)).map((e) => e.minutes)).toEqual([35, 45]);
  });

  it("그저께 기록은 쓰지도 고치지도 지우지도 못한다", async () => {
    const { t, s, me } = await setup();
    await err(saveStudyLog(me, input({ date: "2026-12-08" }), NOW), "어제 기록까지만 고칠 수 있어요");
    await err(saveStudyLog(me, input({ date: "2026-12-11" }), NOW), "어제 기록까지만 고칠 수 있어요");

    const old = await prisma.studyLog.create({ data: { teacherId: t.id, studentId: s.id, studyDate: toDbDate("2026-12-08"), minutes: 30 } });
    await err(saveStudyLog(me, input({ id: old.id, date: "2026-12-08" }), NOW), "어제 기록까지만 고칠 수 있어요");
    // 날짜를 오늘로 바꿔 보내도 못 고친다
    await err(saveStudyLog(me, input({ id: old.id }), NOW), "잘못된 요청이에요");
    await err(deleteStudyLog(me, old.id, NOW), "어제 기록까지만 고칠 수 있어요");
    expect((await rawLogs(t.id))[0]).toMatchObject({ minutes: 30, deletedAt: null });
  });

  it("임시: 선생님 본인 기록만 2026-10-30부터 쓰고 고치고 지운다. 학생은 그대로 오늘·어제만", async () => {
    const { t, me, teacher } = await setup();
    const old = await saveStudyLog(teacher, input({ date: "2026-10-30", minutes: 40 }), NOW);
    await saveStudyLog(teacher, input({ id: old.id, date: "2026-10-30", minutes: 50 }), NOW);
    await err(saveStudyLog(teacher, input({ date: "2026-10-29" }), NOW), "어제 기록까지만 고칠 수 있어요");
    await err(saveStudyLog(teacher, input({ date: "2026-12-11" }), NOW), "어제 기록까지만 고칠 수 있어요");
    expect((await dayEntries(teacher, "2026-10-30")).map((e) => e.minutes)).toEqual([50]);
    await deleteStudyLog(teacher, old.id, NOW);
    expect(await dayEntries(teacher, "2026-10-30")).toEqual([]);

    await err(saveStudyLog(me, input({ date: "2026-10-30" }), NOW), "어제 기록까지만 고칠 수 있어요");
    expect(canEditDate(me, "2026-10-30", NOW)).toBe(false);
    expect(canEditDate(teacher, "2026-10-30", NOW)).toBe(true);
    expect((await rawLogs(t.id)).filter((l) => l.deletedAt === null)).toEqual([]);
  });

  it("공부 시간은 5분 단위, 12시간까지, 하루 24시간까지", async () => {
    const { t, me } = await setup();
    await err(saveStudyLog(me, input({ minutes: 0 }), NOW), "공부 시간을 적어 주세요");
    await err(saveStudyLog(me, input({ minutes: 33 }), NOW), "공부 시간은 5분 단위로 12시간까지 적을 수 있어요");
    await err(saveStudyLog(me, input({ minutes: 725 }), NOW), "공부 시간은 5분 단위로 12시간까지 적을 수 있어요");
    await err(saveStudyLog(me, input({ minutes: 1.5 }), NOW), "잘못된 요청이에요");
    await saveStudyLog(me, input({ minutes: 720 }), NOW);
    await saveStudyLog(me, input({ minutes: 720 }), NOW);
    await err(saveStudyLog(me, input({ minutes: 5 }), NOW), "하루 공부 시간은 24시간을 넘을 수 없어요");
    expect(await rawLogs(t.id)).toHaveLength(2);
  });

  it("잘못된 값은 막는다", async () => {
    const { me } = await setup();
    await err(saveStudyLog(me, null, NOW), "잘못된 요청이에요");
    await err(saveStudyLog(me, input({ date: "12/10" }), NOW), "잘못된 요청이에요");
    await err(saveStudyLog(me, input({ memo: 1 }), NOW), "잘못된 요청이에요");
    await err(saveStudyLog(me, input({ studentId: randomUUID() }), NOW), "잘못된 요청이에요");
    await err(saveStudyLog(me, input({ id: randomUUID() }), NOW), "없는 기록이에요");
    await err(saveStudyLog(me, input({ memo: "x".repeat(5001) }), NOW), "내용은 5,000자까지 쓸 수 있어요");
  });

  it("지우면 사진도 지운 것으로 표시하고 화면에서 빠진다", async () => {
    const { me } = await setup();
    const { storage, uploadAll } = fakeStorage();
    const [up] = await prepareUploads(me, 1, storage);
    uploadAll();
    const log = await saveStudyLog(me, input({ photos: [{ token: up.token }] }), NOW, storage);
    await deleteStudyLog(me, log.id, NOW);
    expect(await dayEntries(me, TODAY, storage)).toEqual([]);
    expect((await rawFiles(log.id))[0].deletedAt).toEqual(NOW);
  });
});

describe("사진 (STUDY-07)", () => {
  it("올린 사진을 순서대로 붙이고, 빼고, 순서를 바꾼다", async () => {
    const { t, s, me } = await setup();
    const { storage, uploadAll } = fakeStorage();
    const ups = await prepareUploads(me, 3, storage);
    uploadAll(2000);
    const log = await saveStudyLog(me, input({ photos: ups.map((u) => ({ token: u.token })) }), NOW, storage);

    const files = await rawFiles(log.id);
    expect(files.map((f) => f.sortOrder)).toEqual([0, 1, 2]);
    expect(files.every((f) => f.r2Key === `teachers/${t.id}/STUDY_PHOTO/${f.id}.jpg` && f.uploaderStudentId === s.id && f.sizeBytes === 2000)).toBe(true);

    // 두 번째를 빼고 셋째를 앞으로, 새 사진 하나 추가
    const [more] = await prepareUploads(me, 1, storage);
    uploadAll();
    await saveStudyLog(me, input({ id: log.id, photos: [{ fileId: files[2].id }, { fileId: files[0].id }, { token: more.token }] }), NOW, storage);
    const [entry] = await dayEntries(me, TODAY, storage);
    expect(entry.photos.map((p) => p.id).slice(0, 2)).toEqual([files[2].id, files[0].id]);
    expect(entry.photos).toHaveLength(3);
    expect(entry.photos[0].url).toBe(`https://view/${files[2].r2Key}`);
    expect((await rawFiles(log.id)).find((f) => f.id === files[1].id)?.deletedAt).toEqual(NOW);
  });

  it("올리지 않은 사진, 형식·크기가 다른 사진, 같은 표 두 번, 10장 넘게는 막는다", async () => {
    const { t, me } = await setup();
    const { storage, uploadAll } = fakeStorage();
    const [notUploaded] = await prepareUploads(me, 1, storage);
    await err(saveStudyLog(me, input({ photos: [{ token: notUploaded.token }] }), NOW, storage), "사진을 올리지 못했어요. 다시 올려 주세요");

    const [png] = await prepareUploads(me, 1, storage);
    uploadAll(1000, "image/png");
    await err(saveStudyLog(me, input({ photos: [{ token: png.token }] }), NOW, storage), "올릴 수 없는 사진이에요");

    const [big] = await prepareUploads(me, 1, storage);
    uploadAll(PHOTO_MAX_BYTES + 1);
    await err(saveStudyLog(me, input({ photos: [{ token: big.token }] }), NOW, storage), "올릴 수 없는 사진이에요");

    const [ok] = await prepareUploads(me, 1, storage);
    uploadAll();
    await err(saveStudyLog(me, input({ photos: [{ token: ok.token }, { token: ok.token }] }), NOW, storage), "잘못된 요청이에요");
    await saveStudyLog(me, input({ photos: [{ token: ok.token }] }), NOW, storage);
    await err(saveStudyLog(me, input({ photos: [{ token: ok.token }] }), NOW, storage), "이미 저장한 사진이에요. 화면을 새로 고쳐 주세요");

    await err(saveStudyLog(me, input({ photos: [{ token: "forged" }] }), NOW, storage), "사진을 다시 올려 주세요");
    await err(prepareUploads(me, PHOTO_MAX + 1, storage), "잘못된 요청이에요");
    const many = await prepareUploads(me, PHOTO_MAX, storage);
    await err(saveStudyLog(me, input({ photos: [...many, ok].map((u) => ({ token: u.token })) }), NOW, storage), "잘못된 요청이에요");
    // 실패한 저장은 기록도 남기지 않는다
    expect(await rawLogs(t.id)).toHaveLength(1);
  });

  it("다른 기록의 사진은 붙일 수 없다", async () => {
    const { me } = await setup();
    const { storage, uploadAll } = fakeStorage();
    const [up] = await prepareUploads(me, 1, storage);
    uploadAll();
    const a = await saveStudyLog(me, input({ photos: [{ token: up.token }] }), NOW, storage);
    const b = await saveStudyLog(me, input(), NOW, storage);
    const [photo] = await rawFiles(a.id);
    await err(saveStudyLog(me, input({ id: b.id, photos: [{ fileId: photo.id }] }), NOW, storage), "없는 사진이에요");
    expect(await rawFiles(b.id)).toEqual([]);
  });
});

describe("합계 (STUDY-04)", () => {
  it("이번 주(일요일부터)·이번 달·누적 시간과 'N일 중 M일'. 분모는 가입한 날부터 오늘까지", async () => {
    // 11/20 가입. 12/10(목) 기준 이번 주는 12/6(일)~, 이번 달은 12/1~, 누적은 11/20~ (21일)
    const { t, s, me } = await setup(kstToUtc(2026, 11, 20, 15 * 60));
    const log = (date: string, minutes: number) => prisma.studyLog.create({ data: { teacherId: t.id, studentId: s.id, studyDate: toDbDate(date), minutes } });
    await log("2026-11-25", 60);
    await log("2026-12-02", 30);
    await log("2026-12-07", 20);
    await log("2026-12-07", 25);
    await log(TODAY, 15);

    expect(await studySummary(me, NOW)).toEqual({
      week: { minutes: 60, studiedDays: 2, days: 5 },
      month: { minutes: 90, studiedDays: 3, days: 10 },
      all: { minutes: 150, studiedDays: 4, days: 21 },
    });
  });

  it("가입한 날 어제 기록을 쓰면 그날부터 센다. 이번 주 분모도 가입한 날부터", async () => {
    const { me } = await setup(kstToUtc(2026, 12, 10, 0)); // 오늘 가입
    expect((await studySummary(me, NOW)).week).toEqual({ minutes: 0, studiedDays: 0, days: 1 });
    await saveStudyLog(me, input({ date: YESTERDAY }), NOW);
    const sum = await studySummary(me, NOW);
    expect(sum.week).toEqual({ minutes: 30, studiedDays: 1, days: 2 });
    expect(sum.all).toEqual({ minutes: 30, studiedDays: 1, days: 2 });
  });
});

describe("격리 (STUDY-06, 08)", () => {
  it("학생은 다른 학생·선생님 본인 기록을 못 보고 못 고친다", async () => {
    const { t, s, me, teacher } = await setup();
    const other = await newStudent(t.id);
    const otherMe = studentOwner(t.id, other.id);
    const { storage, uploadAll } = fakeStorage();

    const mine = await saveStudyLog(me, input({ memo: "- 내 것" }), NOW);
    const theirs = await saveStudyLog(otherMe, input({ memo: "- 다른 학생" }), NOW);
    const teachers = await saveStudyLog(teacher, input({ memo: "- 선생님 본인" }), NOW);

    expect((await dayEntries(me, TODAY)).map((e) => e.id)).toEqual([mine.id]);
    expect((await monthEntries(me, { year: 2026, month: 12 })).map((e) => e.id)).toEqual([mine.id]);
    await err(saveStudyLog(me, input({ id: theirs.id }), NOW), "없는 기록이에요");
    await err(saveStudyLog(me, input({ id: teachers.id }), NOW), "없는 기록이에요");
    await err(deleteStudyLog(me, theirs.id, NOW), "없는 기록이에요");

    // 다른 학생에게 발급한 사진 표는 못 쓴다
    const [up] = await prepareUploads(otherMe, 1, storage);
    uploadAll();
    await err(saveStudyLog(me, input({ photos: [{ token: up.token }] }), NOW, storage), "사진을 다시 올려 주세요");

    // 선생님 본인 기록은 선생님만 (학생 기록과 섞이지 않는다)
    expect((await dayEntries(teacher, TODAY)).map((e) => e.memo)).toEqual(["- 선생님 본인"]);
    expect((await studySummary(teacher, NOW)).week.minutes).toBe(30);
    expect((await rawLogs(t.id)).map((l) => l.studentId)).toEqual([s.id, other.id, null]);
  });

  it("선생님은 자기 학생 기록(사진 포함)을 보고, 다른 선생님 학생 기록은 못 본다", async () => {
    const a = await setup();
    const b = await setup();
    const { storage, uploadAll } = fakeStorage();
    const [up] = await prepareUploads(b.me, 1, storage);
    uploadAll();
    const log = await saveStudyLog(b.me, input({ photos: [{ token: up.token }] }), NOW, storage);

    const bView: StudyOwner = { db: teacherDb(b.t.id), teacherId: b.t.id, studentId: b.s.id };
    const [entry] = await dayEntries(bView, TODAY, storage);
    expect(entry.id).toBe(log.id);
    expect(entry.photos).toHaveLength(1);

    const aView: StudyOwner = { db: teacherDb(a.t.id), teacherId: a.t.id, studentId: b.s.id };
    expect(await dayEntries(aView, TODAY, storage)).toEqual([]);
    expect((await studySummary(aView, NOW)).all.minutes).toBe(0);
    await err(saveStudyLog(a.teacher, input({ id: log.id }), NOW), "없는 기록이에요");
    await err(deleteStudyLog(a.teacher, log.id, NOW), "없는 기록이에요");
    // 다른 선생님에게 발급한 표도 못 쓴다
    const [bUp] = await prepareUploads(b.teacher, 1, storage);
    uploadAll();
    await err(saveStudyLog(a.teacher, input({ photos: [{ token: bUp.token }] }), NOW, storage), "사진을 다시 올려 주세요");
  });
});
