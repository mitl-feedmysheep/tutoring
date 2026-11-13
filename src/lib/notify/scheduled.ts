import type { NotificationKind } from "@/generated/prisma/client";
import { teacherDb, type ScopedDb } from "@/lib/db/scope";
import { listTeacherIds } from "@/lib/db/teachers";
import { pushConfigured, sendPush, type PushPayload, type PushTarget } from "@/lib/push/push";
import { clockText, kstParts } from "@/lib/schedule/kst";
import { isUniqueError } from "@/lib/schedule/student";
import { toDbDate, todayKey } from "@/lib/study/study";

// 시간에 맞춰 보내는 알림 (NOTI-01 수업 30분 전, NOTI-04 밤 11시 공부 기록). 스케줄러가 1분마다 부른다.
// 정각에 맞추지 않고 "보낼 때가 지났는데 발송 기록이 없는 것"을 보낸다. 배포로 잠깐 멈춰도 다시 뜨면 늦게라도 간다.
// 발송 기록을 먼저 남기고 보낸다: 중간에 꺼지면 빠질 수는 있어도 두 번 가지는 않는다

export const LESSON_REMINDER_MINUTES = 30;
/** 밤 11시 (KST, 자정부터 분) */
export const STUDY_REMINDER_MINUTE = 23 * 60;
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

/** 처음 보내는 알림이면 기록하고 보낸다 */
async function sendOnce(teacherId: string, db: ScopedDb, kind: NotificationKind, targetKey: string, to: PushTarget, payload: PushPayload, now: Date) {
  const recipient = to.teacher ? TEACHER_RECIPIENT : to.studentIds![0];
  if (!(await claimNotification(db, kind, targetKey, recipient))) return;
  await sendPush(teacherId, to, payload, now);
}

/**
 * NOTI-01: 앞으로 30분 안에 시작하는 수업. 선생님과 참여 학생(취소 안 함, 활성)에게 한 번씩.
 * 이미 시작한 수업은 보내지 않는다. 참여 학생이 없는 슬롯은 선생님에게도 보내지 않는다
 */
export async function sendLessonReminders(teacherId: string, now: Date) {
  const db = teacherDb(teacherId);
  const slots = await db.slot.findMany({
    where: { startsAt: { gt: now, lte: new Date(now.getTime() + LESSON_REMINDER_MINUTES * 60_000) } },
    select: {
      id: true,
      startsAt: true,
      lessons: {
        where: { canceledAt: null, student: { deactivatedAt: null, deletedAt: null } },
        select: { studentId: true, student: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  for (const slot of slots) {
    if (slot.lessons.length === 0) continue;
    const left = Math.max(1, Math.round((slot.startsAt.getTime() - now.getTime()) / 60_000));
    const body = `${clockText(slot.startsAt)} 수업이 ${left}분 뒤에 시작돼요`;
    const names = slot.lessons.map((l) => l.student.name).join(", ");
    await sendOnce(teacherId, db, "LESSON_REMINDER", slot.id, { teacher: true }, { title: "곧 수업이 시작돼요", body: `${body} · ${names}`, url: "/" }, now);
    for (const { studentId } of slot.lessons) {
      await sendOnce(teacherId, db, "LESSON_REMINDER", slot.id, { studentIds: [studentId] }, { title: "곧 수업이 시작돼요", body, url: "/" }, now);
    }
  }
}

/** NOTI-04: KST 밤 11시가 지났는데 오늘 공부 기록이 없는 활성 학생에게 하루 한 번 */
export async function sendStudyReminders(teacherId: string, now: Date) {
  if (kstParts(now).minute < STUDY_REMINDER_MINUTE) return;
  const date = todayKey(now);
  const db = teacherDb(teacherId);
  const students = await db.student.findMany({
    where: { deactivatedAt: null, studyLogs: { none: { studyDate: toDbDate(date), deletedAt: null } } },
    select: { id: true },
  });
  for (const { id } of students) {
    await sendOnce(
      teacherId,
      db,
      "STUDY_MISSING",
      date,
      { studentIds: [id] },
      { title: "오늘 공부 기록이 아직 없어요", body: "오늘 공부한 시간을 남겨 보세요.", url: `/study/${date}` },
      now,
    );
  }
}

/** 스케줄러가 부른다. 선생님마다 각자의 범위에서 처리하고, 한 선생님이 실패해도 다른 선생님은 계속한다 */
export async function runScheduledNotifications(now = new Date()) {
  // 키가 없는 곳(로컬 개발 서버 등)에서 기록만 남기고 못 보내면 운영 서버가 그 알림을 못 보낸다
  if (!pushConfigured()) return;
  for (const teacherId of await listTeacherIds()) {
    for (const job of [sendLessonReminders, sendStudyReminders]) {
      try {
        await job(teacherId, now);
      } catch (e) {
        console.error(`[notify] ${job.name} 실패 teacher=${teacherId}`, e);
      }
    }
  }
}
