"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth/session";
import { disconnectGoogle, MeetingSettingsError, saveMeetingSettings } from "@/lib/meeting/meeting";

// 화상 수업 설정 액션 (MEET-06, MEET-01). teacherId는 requireTeacher(서버 세션)에서만 나온다

export type MeetingSettingsState = { ok?: boolean; error?: string } | undefined;

export async function saveMeetingSettingsAction(_: MeetingSettingsState, form: FormData): Promise<MeetingSettingsState> {
  const { db, teacherId } = await requireTeacher();
  try {
    await saveMeetingSettings(db, teacherId, { provider: String(form.get("provider") ?? ""), fixedUrl: String(form.get("fixedUrl") ?? "") });
    revalidatePath("/admin/meeting");
    return { ok: true };
  } catch (e) {
    if (e instanceof MeetingSettingsError) return { error: e.message };
    throw e;
  }
}

export async function disconnectGoogleAction() {
  const { db } = await requireTeacher();
  await disconnectGoogle(db);
  revalidatePath("/admin/meeting");
}
