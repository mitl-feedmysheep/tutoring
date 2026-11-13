import { teacherDb } from "@/lib/db/scope";
import { pushConfigured } from "@/lib/push/push";
import { slotText } from "@/lib/schedule/kst";
import { sendOnce } from "./send";

// 사용자 동작 때 보내는 알림 (NOTI-02, 03, 05, 07). 액션이 응답을 보낸 뒤(later.ts) 부른다.
// teacherId는 서버 세션에서 나온 값. 무엇을 보낼지는 id로 DB에서 다시 읽는다 (선생님 범위 안에서만)

const COMMENT_PREVIEW = 80;

type ChangeRow = { lessonId: string | null; action: "ADD" | "CANCEL" | "MOVE" | "CHANGE" | "REMOVE"; beforeText: string | null; afterText: string | null };

/** 변경 이력 한 줄 → 알림 한 줄 */
export function changeLine(c: ChangeRow): string {
  const weekly = c.lessonId === null;
  switch (c.action) {
    case "ADD":
      return weekly ? `고정 일정 추가: ${c.afterText}` : `예약: ${c.afterText}`;
    case "CANCEL":
      return `취소: ${c.beforeText}`;
    case "MOVE":
      return `옮김: ${c.beforeText} → ${c.afterText}`;
    case "CHANGE":
      return `고정 일정 변경: ${c.beforeText} → ${c.afterText}`;
    case "REMOVE":
      return `고정 일정 빼기: ${c.beforeText}`;
  }
}

/**
 * NOTI-02, NOTI-07: 일정 변경 한 번(이력 여러 줄일 수 있음)을 알림 하나로.
 * 학생이 바꿨으면 선생님에게, 선생님이 바꿨으면 학생에게 사유와 함께 보낸다
 */
export async function notifyScheduleChange(teacherId: string, studentId: string, changeIds: string[], now = new Date()) {
  if (!pushConfigured() || changeIds.length === 0) return;
  const db = teacherDb(teacherId);
  const rows = await db.scheduleChange.findMany({
    where: { id: { in: changeIds }, studentId, changedBy: { in: ["STUDENT", "TEACHER"] } },
    select: { id: true, lessonId: true, action: true, beforeText: true, afterText: true, changedBy: true, reason: true, student: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) return;
  const first = rows[0];
  const lines = rows.map(changeLine);

  if (first.changedBy === "TEACHER") {
    if (first.reason) lines.push(`사유: ${first.reason}`);
    await sendOnce(teacherId, db, "TEACHER_CHANGED", first.id, { studentId }, { title: "선생님이 수업 일정을 바꿨어요", body: lines.join("\n"), url: "/lessons" }, now);
  } else {
    await sendOnce(
      teacherId,
      db,
      "SCHEDULE_CHANGED",
      first.id,
      { teacher: true },
      { title: `${first.student.name} 학생이 일정을 바꿨어요`, body: lines.join("\n"), url: `/admin/students/${studentId}` },
      now,
    );
  }
}

/** NOTI-03: 선생님이 지운 슬롯을 예약했던 학생들에게 */
export async function notifySlotDeleted(teacherId: string, slot: { id: string; startsAt: Date }, studentIds: string[], now = new Date()) {
  if (!pushConfigured()) return;
  const db = teacherDb(teacherId);
  for (const studentId of studentIds) {
    await sendOnce(
      teacherId,
      db,
      "SLOT_DELETED",
      slot.id,
      { studentId },
      { title: "수업이 취소됐어요", body: `선생님이 ${slotText(slot.startsAt)} 수업을 없앴어요. 필요하면 다른 시간을 예약해 주세요.`, url: "/book" },
      now,
    );
  }
}

/** NOTI-05: 새 글을 상대방에게. 학생이 쓰면 선생님에게, 선생님이 쓰면 그 학생에게 */
export async function notifyBoardPost(teacherId: string, postId: string, now = new Date()) {
  if (!pushConfigured()) return;
  const db = teacherDb(teacherId);
  const post = await db.board.findFirst({ where: { id: postId }, select: { id: true, studentId: true, author: true, title: true, student: { select: { name: true } } } });
  if (!post) return;
  const url = `/board/${post.id}`;
  if (post.author === "STUDENT") {
    await sendOnce(teacherId, db, "BOARD", post.id, { teacher: true }, { title: `${post.student.name} 학생이 새 글을 올렸어요`, body: post.title, url }, now);
  } else {
    await sendOnce(teacherId, db, "BOARD", post.id, { studentId: post.studentId }, { title: "선생님이 새 글을 올렸어요", body: post.title, url }, now);
  }
}

/** NOTI-05: 댓글을 상대방에게 */
export async function notifyBoardComment(teacherId: string, commentId: string, now = new Date()) {
  if (!pushConfigured()) return;
  const db = teacherDb(teacherId);
  const comment = await db.comment.findFirst({
    where: { id: commentId },
    select: { id: true, author: true, content: true, board: { select: { id: true, studentId: true, deletedAt: true, student: { select: { name: true } } } } },
  });
  if (!comment || comment.board.deletedAt) return;
  const body = comment.content.length > COMMENT_PREVIEW ? `${comment.content.slice(0, COMMENT_PREVIEW)}…` : comment.content;
  const url = `/board/${comment.board.id}`;
  if (comment.author === "STUDENT") {
    await sendOnce(teacherId, db, "BOARD", comment.id, { teacher: true }, { title: `${comment.board.student.name} 학생이 댓글을 달았어요`, body, url }, now);
  } else {
    await sendOnce(teacherId, db, "BOARD", comment.id, { studentId: comment.board.studentId }, { title: "선생님이 댓글을 달았어요", body, url }, now);
  }
}
