"use server";

import { revalidatePath } from "next/cache";
import { requireSystemAdmin, requireTeacher } from "@/lib/auth/session";
import { createTeacherByAdmin } from "@/lib/auth/teachers";
import { issueInvite, revokeInvite } from "@/lib/admin/invites";
import { resetStudentPassword } from "@/lib/admin/students";

// 선생님 액션. teacherId는 requireTeacher(서버 세션)에서만 나오고, 클라이언트는 대상 id만 보낸다

export type IssueState = { token?: string; expiresAt?: string; error?: string } | undefined;

export async function issueInviteAction(_: IssueState, form: FormData): Promise<IssueState> {
  const { db, teacherId } = await requireTeacher();
  try {
    const invite = await issueInvite(db, teacherId, String(form.get("memo") ?? ""));
    revalidatePath("/admin/students/invites");
    return { token: invite.token, expiresAt: invite.expiresAt.toISOString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "발급하지 못했어요" };
  }
}

export async function revokeInviteAction(id: string) {
  const { db } = await requireTeacher();
  const ok = await revokeInvite(db, id);
  revalidatePath("/admin/students/invites");
  return ok;
}

export async function resetPasswordAction(studentId: string) {
  const { db } = await requireTeacher();
  const ok = await resetStudentPassword(db, studentId);
  revalidatePath("/admin/students");
  return ok;
}

export type CreateTeacherState = { created?: { name: string; email: string }; error?: string; values?: Record<string, string> } | undefined;

export async function createTeacherAction(_: CreateTeacherState, form: FormData): Promise<CreateTeacherState> {
  const { account } = await requireSystemAdmin();
  const values = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  try {
    const t = await createTeacherByAdmin(account, { ...values, password: String(form.get("password") ?? "") });
    revalidatePath("/admin/teachers");
    return { created: { name: t.name, email: t.email } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "만들지 못했어요", values };
  }
}
