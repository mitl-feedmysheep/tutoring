"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { ScheduleError } from "@/lib/schedule/teacher";
import { deleteStudyLog, prepareUploads, saveStudyLog, studyOwnerOf } from "@/lib/study/study";
import type { ActionResult } from "./lesson-actions";

// 웹앱 공부 기록 액션 (학생 본인, 선생님 본인). 주인은 서버 세션(requireUser)에서만 정하고, 클라이언트는 기록 내용과 기록 id만 보낸다

async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    revalidatePath("/study", "layout");
    return { ok: true, ...value };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

async function owner() {
  return studyOwnerOf((await requireUser()).claims);
}

/** 사진 count장을 올릴 서명 URL과 표 (STUDY-07) */
export async function prepareStudyUploadsAction(count: number) {
  const me = await owner();
  try {
    return { ok: true as const, uploads: await prepareUploads(me, count) };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function saveStudyLogAction(input: unknown) {
  const me = await owner();
  return run(() => saveStudyLog(me, input));
}

export async function deleteStudyLogAction(id: string) {
  const me = await owner();
  return run(async () => {
    await deleteStudyLog(me, id);
    return {};
  });
}
