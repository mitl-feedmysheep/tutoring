"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { teacherStudentCtx } from "@/lib/admin/student-schedule";
import { notifyScheduleChange } from "@/lib/notify/events";
import { notifyLater } from "@/lib/notify/later";
import { bookSlot, cancelLesson, moveLesson } from "@/lib/schedule/student";
import { ScheduleError } from "@/lib/schedule/teacher";
import { applyWeeklyChange } from "@/lib/schedule/weekly";

// 선생님이 학생 일정을 바꾸는 액션 (SCH-16). teacherId는 requireTeacher(서버 세션)에서만 나오고,
// 학생 id는 teacherStudentCtx가 내 학생인지 확인한다. 사유는 필수 (policyOf가 확인)

export type ActionResult = { ok: true } | { ok: false; error: string };

const ID = /^[0-9a-f-]{36}$/;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !ID.test(id)) throw new ScheduleError("잘못된 요청이에요");
  return id;
}

async function run(studentId: string, reason: string, fn: (ctx: Awaited<ReturnType<typeof teacherStudentCtx>>) => Promise<{ changeIds: string[] }>): Promise<ActionResult> {
  const { db, teacherId } = await requireTeacher();
  try {
    const ctx = await teacherStudentCtx(db, teacherId, studentId, String(reason ?? ""));
    const { changeIds } = await fn(ctx);
    // 학생에게 알림, 사유 포함 (NOTI-07)
    notifyLater("선생님 일정 변경", () => notifyScheduleChange(teacherId, ctx.studentId, changeIds));
    revalidatePath(`/admin/students/${ctx.studentId}`);
    revalidatePath("/admin/schedule", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function teacherBookAction(studentId: string, slotId: string, reason: string) {
  return run(studentId, reason, (ctx) => bookSlot(ctx, checkId(slotId)));
}

export async function teacherCancelAction(studentId: string, lessonId: string, reason: string) {
  return run(studentId, reason, (ctx) => cancelLesson(ctx, checkId(lessonId)));
}

export async function teacherMoveAction(studentId: string, lessonId: string, slotId: string, reason: string) {
  return run(studentId, reason, (ctx) => moveLesson(ctx, checkId(lessonId), checkId(slotId)));
}

/** 고정 일정 바꾸기는 선생님은 "앞으로 전부"만. 한 번만 바꾸려면 그 수업을 옮긴다 */
export async function teacherWeeklyAction(studentId: string, weeklySlotIds: string[], reason: string) {
  return run(studentId, reason, (ctx) => applyWeeklyChange(ctx, weeklySlotIds, "all"));
}
