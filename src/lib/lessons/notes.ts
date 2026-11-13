import type { ScopedDb } from "@/lib/db/scope";
import { isUniqueError, type StudentCtx } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { cleanNote, NOTE_MAX } from "./note-text";

// 수업 노트 (NOTE-01~05). 수업 1회마다 선생님 노트 1개, 학생 노트 1개 (lesson_note UNIQUE(lesson_id, author)).
// 선생님은 teacherDb로 두 노트를 다 보고 선생님 노트만 쓴다. 학생은 studentDb라 범위 계층이 학생 노트만 보여 준다

export { NOTE_MAX };

const ID = /^[0-9a-f-]{36}$/;

type Author = "TEACHER" | "STUDENT";

/** 저장할 내용으로 정리한다 (cleanNote). 글자 수 검사 */
export function normalizeNote(content: unknown): string {
  if (typeof content !== "string") throw new ScheduleError("잘못된 요청이에요");
  const text = cleanNote(content);
  if (text.length > NOTE_MAX) throw new ScheduleError(`노트는 ${NOTE_MAX.toLocaleString()}자까지 쓸 수 있어요`);
  return text;
}

/** NOTE-05: 노트를 쓸 수 있는 수업은 취소 안 했고, 슬롯이 남아 있고, 시작한 수업 */
async function checkLesson(db: ScopedDb, lessonId: unknown, now: Date): Promise<string> {
  if (typeof lessonId !== "string" || !ID.test(lessonId)) throw new ScheduleError("잘못된 요청이에요");
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, canceledAt: null, slot: { deletedAt: null } },
    select: { id: true, slot: { select: { startsAt: true } } },
  });
  if (!lesson) throw new ScheduleError("없는 수업이에요");
  if (lesson.slot.startsAt > now) throw new ScheduleError("수업이 시작한 뒤에 노트를 쓸 수 있어요");
  return lesson.id;
}

async function writeNote(db: ScopedDb, lessonId: string, author: Author, content: string) {
  const update = async () => {
    const existing = await db.lessonNote.findFirst({ where: { lessonId, author }, select: { id: true } });
    if (existing) await db.lessonNote.updateMany({ where: { id: existing.id }, data: { content } });
    return existing !== null;
  };
  if (await update()) return;
  if (content === "") return; // 없는 노트를 비우는 것은 할 일 없음
  try {
    // teacher_id는 범위 계층이 채운다
    await db.lessonNote.create({ data: { lessonId, author, content } as never });
  } catch (e) {
    // 같은 노트를 동시에 처음 저장한 경우: 먼저 만든 행을 고친다
    if (!isUniqueError(e) || !(await update())) throw e;
  }
}

/** NOTE-01: 선생님 노트 저장. db는 서버 세션에서 만든 teacherDb */
export async function saveTeacherNote(db: ScopedDb, lessonId: unknown, content: unknown, now = new Date()) {
  const text = normalizeNote(content);
  const id = await checkLesson(db, lessonId, now);
  await writeNote(db, id, "TEACHER", text);
}

/** NOTE-02, APP-10: 학생 노트 저장. 기한 없이 고칠 수 있다 */
export async function saveStudentNote(ctx: StudentCtx, lessonId: unknown, content: unknown, now = new Date()) {
  const text = normalizeNote(content);
  const id = await checkLesson(ctx.db, lessonId, now);
  await writeNote(ctx.db, id, "STUDENT", text);
}

/** 학생 화면: 이 수업의 내 노트 (없으면 "") */
export async function myNote(ctx: StudentCtx, lessonId: string) {
  const note = await ctx.db.lessonNote.findFirst({ where: { lessonId, author: "STUDENT" }, select: { content: true } });
  return note?.content ?? "";
}

export type LessonNotes = { teacher: string; student: string };

/** 선생님 화면: 수업마다 두 노트 (없으면 "") */
export async function notesOf(db: ScopedDb, lessonIds: string[]): Promise<Map<string, LessonNotes>> {
  const map = new Map<string, LessonNotes>(lessonIds.map((id) => [id, { teacher: "", student: "" }]));
  if (lessonIds.length === 0) return map;
  const rows = await db.lessonNote.findMany({ where: { lessonId: { in: lessonIds } }, select: { lessonId: true, author: true, content: true } });
  for (const r of rows) {
    const n = map.get(r.lessonId);
    if (n) n[r.author === "TEACHER" ? "teacher" : "student"] = r.content;
  }
  return map;
}
