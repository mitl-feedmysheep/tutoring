"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/auth/session";
import { saveStudentNote } from "@/lib/lessons/notes";
import { notifyScheduleChange } from "@/lib/notify/events";
import { notifyLater } from "@/lib/notify/later";
import { bookSlot, cancelLesson, moveLesson } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { applyWeeklyChange, planWeeklyChange, type WeeklyMode } from "@/lib/schedule/weekly";

// 학생 예약·취소·옮기기·고정 일정 바꾸기 액션. teacherId·studentId는 requireStudent(서버 세션)에서만 나오고, 클라이언트는 대상 id만 보낸다

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ID = /^[0-9a-f-]{36}$/;

async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    revalidatePath("/", "layout");
    return { ok: true, ...value };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

function checkId(id: unknown): string {
  if (typeof id !== "string" || !ID.test(id)) throw new ScheduleError("잘못된 요청이에요");
  return id;
}

/** 학생이 바꾼 일정을 선생님에게 (NOTI-02) */
function notifyTeacher(ctx: { teacherId: string; studentId: string }, changeIds: string[]) {
  notifyLater("일정 변경", () => notifyScheduleChange(ctx.teacherId, ctx.studentId, changeIds));
}

export async function bookSlotAction(slotId: string) {
  const ctx = await requireStudent();
  return run(async () => {
    const { lessonId, changeIds } = await bookSlot(ctx, checkId(slotId));
    notifyTeacher(ctx, changeIds);
    return { lessonId };
  });
}

export async function cancelLessonAction(lessonId: string) {
  const ctx = await requireStudent();
  return run(async () => {
    const { changeIds } = await cancelLesson(ctx, checkId(lessonId));
    notifyTeacher(ctx, changeIds);
    return {};
  });
}

export async function moveLessonAction(lessonId: string, slotId: string) {
  const ctx = await requireStudent();
  return run(async () => {
    const { lessonId: newId, changeIds } = await moveLesson(ctx, checkId(lessonId), checkId(slotId));
    notifyTeacher(ctx, changeIds);
    return { lessonId: newId };
  });
}

export async function planWeeklyChangeAction(weeklySlotIds: string[]) {
  const ctx = await requireStudent();
  try {
    return { ok: true as const, plan: await planWeeklyChange(ctx, weeklySlotIds) };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function applyWeeklyChangeAction(weeklySlotIds: string[], mode: WeeklyMode) {
  const ctx = await requireStudent();
  return run(async () => {
    const { changeIds } = await applyWeeklyChange(ctx, weeklySlotIds, mode);
    notifyTeacher(ctx, changeIds);
    return {};
  });
}

/** NOTE-02, APP-10: 내 노트 저장 */
export async function saveMyNoteAction(lessonId: string, content: string) {
  const ctx = await requireStudent();
  return run(async () => {
    await saveStudentNote(ctx, lessonId, content);
    return {};
  });
}
