import type { NotificationKind } from "@/generated/prisma/client";
import type { ScopedDb } from "@/lib/db/scope";
import { sendPush, type PushPayload, type PushTarget } from "@/lib/push/push";
import { isUniqueError } from "@/lib/schedule/student";

// 알림 한 번만 보내기 (NOTI 발송 규칙). 시간 알림(scheduled.ts)과 이벤트 알림(events.ts)이 같이 쓴다.
// 발송 기록을 먼저 남기고 보낸다: 중간에 꺼지면 빠질 수는 있어도 두 번 가지는 않는다

/** 발송 기록의 받는 사람: 선생님 */
export const TEACHER_RECIPIENT = "TEACHER";

/** 발송 기록을 남긴다. 이미 있으면(같은 알림을 보냈으면) false */
export async function claimNotification(db: ScopedDb, kind: NotificationKind, targetKey: string, recipient: string): Promise<boolean> {
  try {
    await db.notificationLog.create({ data: { kind, targetKey, recipient } as never, select: { id: true } });
    return true;
  } catch (e) {
    if (isUniqueError(e)) return false;
    throw e;
  }
}

/** 처음 보내는 알림이면 기록하고 보낸다. to는 선생님 또는 학생 한 명 */
export async function sendOnce(
  teacherId: string,
  db: ScopedDb,
  kind: NotificationKind,
  targetKey: string,
  to: { teacher: true } | { studentId: string },
  payload: PushPayload,
  now = new Date(),
) {
  const recipient = "teacher" in to ? TEACHER_RECIPIENT : to.studentId;
  if (!(await claimNotification(db, kind, targetKey, recipient))) return;
  const target: PushTarget = "teacher" in to ? { teacher: true } : { studentIds: [to.studentId] };
  await sendPush(teacherId, target, payload, now);
}
