import webpush from "web-push";
import { z } from "zod";
import type { SessionClaims } from "@/lib/auth/token";
import { claimPushEndpoint } from "@/lib/db/push";
import { studentDb, teacherDb, type ScopedDb } from "@/lib/db/scope";
import { ScheduleError } from "@/lib/schedule/teacher";

// 웹 푸시 (NOTI, APP-12, APP-18). 기기(브라우저) 하나 = 구독 하나.
// 키 이름은 인투디헤븐과 같다: WEBPUSH_VAPID_PUBLIC_KEY, WEBPUSH_VAPID_PRIVATE_KEY, WEBPUSH_VAPID_SUBJECT

/** 알림 내용. url은 알림을 누르면 열 화면 */
export type PushPayload = { title: string; body?: string; url?: string };

/** 받을 사람: 선생님 본인 기기, 학생들 기기 */
export type PushTarget = { teacher?: boolean; studentIds?: string[] };

/** 기기가 오래 꺼져 있으면 푸시 서버가 이 시간까지만 들고 있다가 버린다. 수업 알림이라 늦게 와도 쓸모없어서 짧게 */
const TTL_SECONDS = 60 * 60;

export function vapidPublicKey(): string | null {
  return process.env.WEBPUSH_VAPID_PUBLIC_KEY || null;
}

/** 보낼 수 있는지 (VAPID 키 3개가 다 있는지). 스케줄러는 못 보내면 발송 기록도 남기지 않는다 */
export function pushConfigured(): boolean {
  return Boolean(process.env.WEBPUSH_VAPID_PUBLIC_KEY && process.env.WEBPUSH_VAPID_PRIVATE_KEY && process.env.WEBPUSH_VAPID_SUBJECT);
}

let configured = false;
/** 키가 없으면 보내지 않는다 (오류로 다른 기능까지 멈추지 않게). 보낼 때 처음 한 번 설정 */
function ensureVapid(): boolean {
  if (configured) return true;
  const publicKey = process.env.WEBPUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEBPUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEBPUSH_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.error("[push] VAPID 환경변수가 없어 알림을 보내지 않습니다");
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

function dbOf(claims: SessionClaims): ScopedDb {
  return claims.role === "student" ? studentDb(claims.teacherId, claims.studentId) : teacherDb(claims.teacherId);
}

/** 내 기기 행만. 선생님 범위는 학생 기기도 보이므로 선생님 본인 기기(student_id NULL)로 좁힌다 */
function mine(claims: SessionClaims) {
  return claims.role === "teacher" ? { studentId: null } : {};
}

const Subscription = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(768),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});

function endpointOf(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 768) throw new ScheduleError("잘못된 요청이에요");
  return value;
}

/**
 * 알림 켜기: 이 기기 구독을 지금 로그인한 사람 것으로 저장한다.
 * 같은 기기에서 전에 다른 사람이 켰던 행이면 지금 사람 것으로 옮긴다 (claimPushEndpoint 참고)
 */
export async function savePushSubscription(claims: SessionClaims, raw: unknown, userAgent: string | null) {
  const parsed = Subscription.safeParse(raw);
  if (!parsed.success) throw new ScheduleError("잘못된 요청이에요");
  const { endpoint, keys } = parsed.data;
  const owner = { teacherId: claims.teacherId, studentId: claims.role === "student" ? claims.studentId : null };
  const data = { p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent?.slice(0, 500) || null };
  await claimPushEndpoint(owner, endpoint, data);
}

/** 알림 끄기 (로그아웃 때도). 내 기기 행만 지운다 */
export async function removePushSubscription(claims: SessionClaims, endpoint: unknown, now = new Date()) {
  await dbOf(claims).pushSubscription.updateMany({ where: { endpoint: endpointOf(endpoint), ...mine(claims) }, data: { deletedAt: now } });
}

/** 이 기기 알림이 지금 로그인한 사람에게 켜져 있는지 */
export async function isPushSubscribed(claims: SessionClaims, endpoint: unknown): Promise<boolean> {
  return (await dbOf(claims).pushSubscription.count({ where: { endpoint: endpointOf(endpoint), ...mine(claims) } })) > 0;
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string };

/** 실제로 보낸다. 없어진 구독(404, 410)은 지운다. 실패해도 오류를 내지 않는다: 알림 때문에 예약·글쓰기가 실패하면 안 돼서 */
async function deliver(db: ScopedDb, rows: Row[], payload: PushPayload, now: Date): Promise<number> {
  if (rows.length === 0 || !ensureVapid()) return 0;
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/" });
  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, { TTL: TTL_SECONDS });
        return true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.updateMany({ where: { id: row.id }, data: { deletedAt: now } });
        } else {
          console.error("[push] 보내기 실패", status, (e as Error).message);
        }
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}

/**
 * 선생님 범위 안의 사람들에게 보낸다. teacherId는 서버 세션이나 스케줄러가 DB에서 읽은 값.
 * 비활성화된 학생에게는 보내지 않는다. 보낸 기기 수를 돌려준다
 */
export async function sendPush(teacherId: string, to: PushTarget, payload: PushPayload, now = new Date()): Promise<number> {
  const OR: object[] = [];
  if (to.teacher) OR.push({ studentId: null });
  if (to.studentIds?.length) OR.push({ studentId: { in: to.studentIds }, student: { deactivatedAt: null, deletedAt: null } });
  if (OR.length === 0) return 0;
  const db = teacherDb(teacherId);
  const rows = await db.pushSubscription.findMany({ where: { OR }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  return deliver(db, rows, payload, now);
}

/** 알림 설정 화면의 "시험 알림": 이 기기에만 보낸다 */
export async function sendTestPush(claims: SessionClaims, endpoint: unknown, now = new Date()): Promise<number> {
  const db = dbOf(claims);
  const rows = await db.pushSubscription.findMany({
    where: { endpoint: endpointOf(endpoint), ...mine(claims) },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (rows.length === 0) throw new ScheduleError("이 기기 알림이 꺼져 있어요");
  return deliver(db, rows, { title: "알림이 잘 와요", body: "수업·게시판 알림을 이렇게 받아요.", url: "/my/notifications" }, now);
}
