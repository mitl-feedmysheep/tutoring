"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { parseDateKey, parseTime } from "@/lib/schedule/kst";
import {
  createOneOffSlot,
  createWeeklySlot,
  deleteSlot,
  deleteWeeklySlot,
  ScheduleError,
  updateWeeklySlot,
  type WeeklyChangeResult,
  type WeeklyInput,
} from "@/lib/schedule/teacher";

// 일정 액션. teacherId는 requireTeacher(서버 세션)에서만 나오고, 클라이언트는 대상 id와 입력값만 보낸다

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

function refresh() {
  revalidatePath("/admin/schedule", "layout");
}

/** 화면에 보여 줄 수 있는 오류만 돌려주고, 나머지는 그대로 던진다 */
async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    refresh();
    return { ok: true, ...value };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

function readTimes(form: FormData) {
  const startMinute = parseTime(str(form, "start"));
  const endMinute = parseTime(str(form, "end"));
  if (startMinute === null || endMinute === null) throw new ScheduleError("시간을 입력해 주세요");
  return { startMinute, endMinute };
}

function readWeekly(form: FormData): WeeklyInput {
  const weekday = Number(str(form, "weekday"));
  return { weekday, ...readTimes(form) };
}

export async function createOneOffSlotAction(form: FormData) {
  const { db } = await requireTeacher();
  return run(async () => {
    const date = parseDateKey(str(form, "date"));
    if (!date) throw new ScheduleError("날짜를 다시 골라 주세요");
    await createOneOffSlot(db, { ...date, ...readTimes(form) });
    return {};
  });
}

export async function deleteSlotAction(id: string) {
  const { db } = await requireTeacher();
  return run(async () => {
    const { studentIds } = await deleteSlot(db, id);
    // TODO(5단계): 예약했던 학생들에게 알림 (NOTI-03)
    return { students: studentIds.length };
  });
}

export async function createWeeklySlotAction(form: FormData) {
  const { db } = await requireTeacher();
  return run(async () => {
    await createWeeklySlot(db, readWeekly(form));
    return {};
  });
}

export async function updateWeeklySlotAction(id: string, form: FormData) {
  const { db } = await requireTeacher();
  return run<{ result: WeeklyChangeResult }>(async () => ({
    result: await updateWeeklySlot(db, id, readWeekly(form), str(form, "reason")),
  }));
}

export async function deleteWeeklySlotAction(id: string) {
  const { db } = await requireTeacher();
  return run<{ result: WeeklyChangeResult }>(async () => ({ result: await deleteWeeklySlot(db, id) }));
}
