"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { setAttendance } from "@/lib/lessons/attendance";
import { ScheduleError } from "@/lib/schedule/teacher";

// 완료·결석 체크 (LESSON-01). teacherId는 requireTeacher(서버 세션)에서만 나오고, 클라이언트는 수업 id와 값만 보낸다

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
