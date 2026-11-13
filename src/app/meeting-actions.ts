"use server";

import { requireUser } from "@/lib/auth/session";
import { studentDb } from "@/lib/db/scope";
import { enterAsStudent, enterAsTeacher, MeetingError, meetingErrorText } from "@/lib/meeting/meeting";

// 수업 탭 "들어가기" (MEET-04, APP-16). 서버가 시간을 다시 확인하고 입장 링크를 돌려준다.
// teacherId·studentId는 서버 세션에서만 나오고, 클라이언트는 수업(학생) 또는 슬롯(선생님) id만 보낸다

export type EnterResult = { ok: true; url: string } | { ok: false; error: string };

const ID = /^[0-9a-f-]{36}$/;

/** id: 학생이면 수업 id, 선생님이면 슬롯 id */
export async function enterLessonAction(id: string): Promise<EnterResult> {
  const { claims } = await requireUser("app");
  const role = claims.role;
  try {
    if (typeof id !== "string" || !ID.test(id)) throw new MeetingError("NOT_FOUND");
    const url =
      claims.role === "student"
        ? await enterAsStudent({ db: studentDb(claims.teacherId, claims.studentId), teacherId: claims.teacherId }, id)
        : await enterAsTeacher(claims.teacherId, id);
    return { ok: true, url };
  } catch (e) {
    if (e instanceof MeetingError) return { ok: false, error: meetingErrorText(e.code, role) };
    console.error("[meeting] 들어가기 실패", e);
    return { ok: false, error: meetingErrorText("FAILED", role) };
  }
}
