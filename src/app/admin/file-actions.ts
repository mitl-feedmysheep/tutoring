"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { deleteMaterial, prepareMaterialUpload, saveMaterial, setMaterialAccess, updateMaterial } from "@/lib/files/materials";
import { ScheduleError } from "@/lib/schedule/teacher";
import type { ActionResult } from "@/app/lesson-actions";

// 자료실 액션 (FILE-01, 03). teacherId는 requireTeacher(서버 세션)에서만 나오고, 클라이언트는 자료 id·학생 id·파일 이름만 보낸다

async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    revalidatePath("/admin/files", "layout");
    revalidatePath("/my/files");
    return { ok: true, ...value };
  } catch (e) {
    if (e instanceof ScheduleError) return { ok: false, error: e.message };
    throw e;
  }
}

/** PDF 하나를 올릴 서명 URL과 표 */
export async function prepareMaterialUploadAction(size: number) {
  const { teacherId } = await requireTeacher();
  return run(() => prepareMaterialUpload(teacherId, size));
}

/** R2에 올린 뒤 표를 돌려주면 자료로 저장한다 */
export async function saveMaterialAction(token: string, title: string, description: string) {
  const { db, teacherId } = await requireTeacher();
  return run(() => saveMaterial(db, teacherId, { token, title, description }));
}

export async function setMaterialAccessAction(fileId: string, studentIds: string[]) {
  const { db } = await requireTeacher();
  return run(async () => {
    await setMaterialAccess(db, fileId, studentIds);
    return {};
  });
}

export async function updateMaterialAction(fileId: string, title: string, description: string) {
  const { db } = await requireTeacher();
  return run(async () => {
    await updateMaterial(db, fileId, { title, description });
    return {};
  });
}

export async function deleteMaterialAction(fileId: string) {
  const { db } = await requireTeacher();
  return run(async () => {
    await deleteMaterial(db, fileId);
    return {};
  });
}
