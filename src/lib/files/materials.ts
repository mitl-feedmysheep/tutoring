import { SignJWT, jwtVerify } from "jose";
import { secret } from "@/lib/auth/token";
import type { ScopedDb } from "@/lib/db/scope";
import { isUniqueError } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { r2, type Storage } from "@/lib/storage/r2";
import { uuidv7 } from "@/lib/study/study";
import { FILE_NAME_MAX, MATERIAL_MAX_BYTES, PDF_TYPE, sizeText } from "./rules";

// 자료실 (FILE-01, 03, APP-17). 선생님이 PDF를 올리고 원하는 학생에게 공개한다. 처음엔 아무에게도 안 보인다.
// 선생님은 teacherDb, 학생은 studentDb. 학생 범위에서는 범위 계층이 자기에게 공개된 자료만 보여 준다.
// 올리기는 공부 사진과 같다: 서버가 파일 id·키를 정하고 서명한 표를 준다 → 브라우저가 R2에 바로 올린다 → 표를 돌려주면 저장

const ID = /^[0-9a-f-]{36}$/;
const UPLOAD_AUD = "material-upload";

export const materialKey = (teacherId: string, fileId: string) => `teachers/${teacherId}/MATERIAL/${fileId}.pdf`;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !ID.test(id)) throw new ScheduleError("잘못된 요청이에요");
  return id;
}

// ── 올리기

/** PDF 하나를 올릴 서명 URL과 표. teacherId는 서버 세션에서 나온 값 */
export async function prepareMaterialUpload(teacherId: string, size: unknown, storage: Storage = r2) {
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) throw new ScheduleError("잘못된 요청이에요");
  if (size > MATERIAL_MAX_BYTES) throw new ScheduleError(`PDF는 ${sizeText(MATERIAL_MAX_BYTES)}까지 올릴 수 있어요`);
  const id = uuidv7();
  const token = await new SignJWT({ id, t: teacherId }).setProtectedHeader({ alg: "HS256" }).setAudience(UPLOAD_AUD).setIssuedAt().setExpirationTime("3h").sign(secret());
  return { token, url: await storage.uploadUrl(materialKey(teacherId, id), PDF_TYPE) };
}

async function readUploadToken(teacherId: string, token: unknown) {
  if (typeof token === "string" && token.length <= 2000) {
    try {
      const { payload: p } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: UPLOAD_AUD });
      if (typeof p.id === "string" && ID.test(p.id) && p.t === teacherId) return p.id;
    } catch {
      // 아래에서 거절
    }
  }
  throw new ScheduleError("PDF를 다시 올려 주세요");
}

/** 목록에 보일 이름. 경로를 떼고, 비면 "자료.pdf", 너무 길면 확장자를 남기고 자른다 */
export function cleanFileName(raw: unknown) {
  if (typeof raw !== "string") throw new ScheduleError("잘못된 요청이에요");
  const base = raw.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const name = base || "자료.pdf";
  if (name.length <= FILE_NAME_MAX) return name;
  const ext = /\.pdf$/i.test(name) ? name.slice(-4) : "";
  return name.slice(0, FILE_NAME_MAX - ext.length) + ext;
}

/** FILE-01: 올린 PDF를 자료로 저장한다. R2에 실제로 있는지, 형식·크기를 확인한다 */
export async function saveMaterial(db: ScopedDb, teacherId: string, token: unknown, fileName: unknown, storage: Storage = r2) {
  const name = cleanFileName(fileName);
  const id = await readUploadToken(teacherId, token);
  const key = materialKey(teacherId, id);
  const head = await storage.head(key);
  if (!head) throw new ScheduleError("PDF를 올리지 못했어요. 다시 올려 주세요");
  if (head.contentType !== PDF_TYPE || head.size <= 0 || head.size > MATERIAL_MAX_BYTES) throw new ScheduleError("올릴 수 없는 파일이에요");
  try {
    // teacher_id는 범위 계층이 채운다. uploader_student_id NULL = 선생님이 올림
    await db.file.create({ data: { id, kind: "MATERIAL", fileName: name, r2Key: key, contentType: PDF_TYPE, sizeBytes: head.size } as never });
  } catch (e) {
    if (isUniqueError(e)) throw new ScheduleError("이미 저장한 자료예요. 화면을 새로 고쳐 주세요");
    throw e;
  }
  return { id };
}

// ── 선생님

const ACTIVE_STUDENT = { student: { deactivatedAt: null, deletedAt: null } };

export type MaterialRow = { id: string; fileName: string; sizeBytes: number; createdAt: Date; shared: number };

/** 자료 목록 (최근 올린 것부터). shared: 공개한 활성 학생 수 */
export async function listMaterials(db: ScopedDb): Promise<MaterialRow[]> {
  const rows = await db.file.findMany({
    where: { kind: "MATERIAL" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, sizeBytes: true, createdAt: true, _count: { select: { accesses: { where: ACTIVE_STUDENT } } } },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, shared: _count.accesses }));
}

/** 자료 하나와 활성 학생마다 공개 여부 (이름 순). 없으면 null */
export async function materialDetail(db: ScopedDb, id: string) {
  if (!ID.test(id)) return null;
  const file = await db.file.findFirst({ where: { id, kind: "MATERIAL" }, select: { id: true, fileName: true, sizeBytes: true, createdAt: true } });
  if (!file) return null;
  const [students, accesses] = await Promise.all([
    db.student.findMany({ where: { deactivatedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fileAccess.findMany({ where: { fileId: id }, select: { studentId: true, updatedAt: true } }),
  ]);
  const shared = new Map(accesses.map((a) => [a.studentId, a.updatedAt]));
  return { file, students: students.map((s) => ({ ...s, sharedAt: shared.get(s.id) ?? null })) };
}

/**
 * FILE-03: 공개할 학생을 정한다. studentIds = 공개할 활성 학생 전부 (여러 명 한 번에).
 * 목록에 없는 활성 학생은 공개를 거둔다. 비활성 학생 공개는 건드리지 않는다
 */
export async function setMaterialAccess(db: ScopedDb, fileId: unknown, studentIds: unknown, now = new Date()) {
  const id = checkId(fileId);
  if (!Array.isArray(studentIds) || studentIds.length > 500) throw new ScheduleError("잘못된 요청이에요");
  const wanted = new Set(studentIds.map(checkId));

  const file = await db.file.findFirst({ where: { id, kind: "MATERIAL" }, select: { id: true } });
  if (!file) throw new ScheduleError("없는 자료예요");
  const active = new Set((await db.student.findMany({ where: { deactivatedAt: null }, select: { id: true } })).map((s) => s.id));
  for (const s of wanted) if (!active.has(s)) throw new ScheduleError("없는 학생이에요");

  await db.$transaction(async (tx) => {
    const current = new Set((await tx.fileAccess.findMany({ where: { fileId: id }, select: { studentId: true } })).map((a) => a.studentId));
    const revoke = [...current].filter((s) => active.has(s) && !wanted.has(s));
    if (revoke.length) await tx.fileAccess.updateMany({ where: { fileId: id, studentId: { in: revoke } }, data: { deletedAt: now } });

    for (const studentId of wanted) {
      if (current.has(studentId)) continue;
      // 전에 거둔 공개가 있으면 되살린다 (UNIQUE(file_id, student_id))
      const revived = await tx.fileAccess.updateMany({ where: { fileId: id, studentId, deletedAt: { not: null } }, data: { deletedAt: null } });
      if (revived.count === 0) await tx.fileAccess.create({ data: { fileId: id, studentId } as never });
    }
  });
}

/** 자료 지우기. 공개한 학생에게서도 사라진다 (R2 파일은 남긴다, 공부 사진과 같음) */
export async function deleteMaterial(db: ScopedDb, fileId: unknown, now = new Date()) {
  const id = checkId(fileId);
  const { count } = await db.file.updateMany({ where: { id, kind: "MATERIAL" }, data: { deletedAt: now } });
  if (count === 0) throw new ScheduleError("없는 자료예요");
}

// ── 학생

export type MyMaterial = { id: string; fileName: string; sizeBytes: number; sharedAt: Date };

/** 학생 자료실: 나에게 공개된 자료 (최근 공개한 것부터). db는 studentDb */
export async function myMaterials(db: ScopedDb): Promise<MyMaterial[]> {
  const rows = await db.fileAccess.findMany({
    where: { file: { kind: "MATERIAL", deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true, file: { select: { id: true, fileName: true, sizeBytes: true } } },
  });
  return rows.map((r) => ({ ...r.file, sharedAt: r.updatedAt }));
}

// ── 보기 (선생님, 학생 공통)

/** APP-17: PDF를 화면에 여는 서명 URL. 볼 수 없으면 null. 학생 범위에서는 범위 계층이 나에게 공개된 자료만 찾는다 */
export async function materialViewUrl(db: ScopedDb, fileId: string, storage: Storage = r2) {
  if (!ID.test(fileId)) return null;
  const file = await db.file.findFirst({ where: { id: fileId, kind: "MATERIAL" }, select: { r2Key: true, fileName: true } });
  if (!file) return null;
  return storage.viewUrl(file.r2Key, file.fileName);
}
