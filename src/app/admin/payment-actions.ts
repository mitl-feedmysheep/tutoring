"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { setPayment } from "@/lib/payments/payments";
import { ScheduleError } from "@/lib/schedule/teacher";

// 과외비 납부 체크 (PAY-01, 03). teacherId는 requireTeacher(서버 세션)에서만 나오고, 클라이언트는 학생 id·달·체크 여부만 보낸다

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setPaymentAction(studentId: string, month: string, paid: boolean): Promise<ActionResult> {
  const { db } = await requireTeacher();
  try {
    await setPayment(db, studentId, month, paid);
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/admin/payments");
  revalidatePath("/admin/students", "layout");
  revalidatePath("/my/payments");
  return { ok: true };
}
