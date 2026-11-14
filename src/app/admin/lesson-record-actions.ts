"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { setAttendance } from "@/lib/lessons/attendance";
import { noteHistory, saveTeacherNote } from "@/lib/lessons/notes";
import { clockText, slotText } from "@/lib/schedule/kst";
import { ScheduleError } from "@/lib/schedule/teacher";

// 완료·결석 체크 (LESSON-01), 선생님 노트 (NOTE-01). teacherId는 requireTeacher(서버 세션)에서만 나오고, 클라이언트는 수업 id와 값만 보낸다

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setAttendanceAction(lessonId: string, value: "COMPLETED" | "ABSENT" | null): Promise<ActionResult> {
  const { db } = await requireTeacher();
  try {
    await setAttendance(db, lessonId, value);
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/admin/schedule", "layout");
  revalidatePath("/admin/students", "layout");
  return { ok: true };
}

/** NOTE-01: 선생님 노트 저장 */
export async function saveTeacherNoteAction(lessonId: string, content: string): Promise<ActionResult> {
  const { db } = await requireTeacher();
  try {
    await saveTeacherNote(db, lessonId, content);
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/admin/students", "layout");
  return { ok: true };
}

export type NoteHistoryView = { id: string; label: string; fixed: boolean; teacher: string; student: string };

const ID = /^[0-9a-f-]{36}$/;

/** 일정 화면에서 학생을 누르면 여는 노트 창 (NOTE-03). 학생 id만 받고, 범위는 서버 세션의 선생님 */
export async function noteHistoryAction(studentId: string): Promise<NoteHistoryView[]> {
  const { db } = await requireTeacher();
  if (typeof studentId !== "string" || !ID.test(studentId)) return [];
  const items = await noteHistory(db, studentId);
  return items.map((l) => ({ id: l.id, label: `${slotText(l.startsAt)}–${clockText(l.endsAt)}`, fixed: l.fixed, teacher: l.notes.teacher, student: l.notes.student }));
}
