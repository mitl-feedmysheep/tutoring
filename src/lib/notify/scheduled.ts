import { teacherDb } from "@/lib/db/scope";
import { listTeacherIds } from "@/lib/db/teachers";
import { pushConfigured } from "@/lib/push/push";
import { addMonths, clockText, isLastDayOfMonth, kstParts, monthOf } from "@/lib/schedule/kst";
import { toDbDate, todayKey } from "@/lib/study/study";
import { sendOnce } from "./send";

// 스케줄러가 보내는 알림 (NOTI-01 수업 30분 전, NOTI-04 밤 11시 공부 기록, NOTI-06 고정 일정 누락). 스케줄러가 1분마다 부른다.
// 정각에 맞추지 않고 "보낼 때가 지났는데 발송 기록이 없는 것"을 보낸다. 배포로 잠깐 멈춰도 다시 뜨면 늦게라도 간다.
// 한 번만 보내는 규칙은 send.ts

export const LESSON_REMINDER_MINUTES = 30;
/** 밤 11시 (KST, 자정부터 분) */
export const STUDY_REMINDER_MINUTE = 23 * 60;
/** 고정 일정 누락 알림: 월 생성 뒤 이 시간 안의 기록만 본다 (배포로 멈췄다 떠도 늦게라도 보내되, 오래된 것은 안 보냄) */
const WEEKLY_MISSING_WINDOW_MS = 2 * 24 * 60 * 60_000;

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
      await sendOnce(teacherId, db, "LESSON_REMINDER", slot.id, { studentId }, { title: "곧 수업이 시작돼요", body, url: "/" }, now);
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
      { studentId: id },
      { title: "오늘 공부 기록이 아직 없어요", body: "오늘 공부한 시간을 남겨 보세요.", url: `/study/${date}` },
      now,
    );
  }
}

/**
 * NOTI-06: 월 생성 때 선생님 고정 시간이 없어져 끝난 학생 고정 일정 (generate.ts가 SYSTEM REMOVE 이력을 남긴다).
 * 이력을 보고 보내므로 생성 직후 서버가 꺼져도 다음에 늦게라도 간다. 학생마다 그날 한 번에 모아서 한 번
 */
export async function sendWeeklyMissing(teacherId: string, now: Date) {
  const db = teacherDb(teacherId);
  const rows = await db.scheduleChange.findMany({
    where: { changedBy: "SYSTEM", action: "REMOVE", createdAt: { gt: new Date(now.getTime() - WEEKLY_MISSING_WINDOW_MS), lte: now } },
    select: { studentId: true, beforeText: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, { studentId: string; day: string; at: Date; texts: string[] }>();
  for (const r of rows) {
    const day = todayKey(r.createdAt);
    const key = `${r.studentId}:${day}`;
    const g = groups.get(key) ?? { studentId: r.studentId, day, at: r.createdAt, texts: [] };
    if (r.beforeText) g.texts.push(r.beforeText);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    // 마지막 날에 만들면 다음 달, 놓쳐서 1일 이후에 만들면 이번 달부터 빠진다
    const month = isLastDayOfMonth(g.at) ? addMonths(monthOf(g.at), 1).month : monthOf(g.at).month;
    await sendOnce(
      teacherId,
      db,
      "WEEKLY_MISSING",
      g.day,
      { studentId: g.studentId },
      {
        title: "고정 수업 일부가 없어졌어요",
        body: `선생님 수업 시간이 바뀌어 ${month}월부터 ${g.texts.join(", ")} 수업이 잡히지 않아요. 다른 시간을 골라 주세요.`,
        url: "/lessons/weekly",
      },
      now,
    );
  }
}

/** 스케줄러가 부른다. 선생님마다 각자의 범위에서 처리하고, 한 선생님이 실패해도 다른 선생님은 계속한다 */
export async function runScheduledNotifications(now = new Date()) {
  // 키가 없는 곳(로컬 개발 서버 등)에서 기록만 남기고 못 보내면 운영 서버가 그 알림을 못 보낸다
  if (!pushConfigured()) return;
  for (const teacherId of await listTeacherIds()) {
    for (const job of [sendLessonReminders, sendStudyReminders, sendWeeklyMissing]) {
      try {
        await job(teacherId, now);
      } catch (e) {
        console.error(`[notify] ${job.name} 실패 teacher=${teacherId}`, e);
      }
    }
  }
}
