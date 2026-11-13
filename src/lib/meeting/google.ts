// Google OAuth + Calendar API를 fetch로 직접 부른다 (MEET-01, 02, 03, 07).
// googleapis 패키지는 크고 여기서 쓰는 호출은 몇 개뿐이라 쓰지 않는다

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** 캘린더 일정 만들기·고치기만. 다른 캘린더나 메일 권한은 받지 않는다 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = ["openid", "email", CALENDAR_SCOPE];

/** 구글 OAuth 클라이언트에 등록한 리디렉션 주소의 출처. 요청 Host 값을 그대로 믿지 않고 이 중에서만 고른다 */
export const ALLOWED_ORIGINS = ["https://tutoring.intotheheaven.app", "http://localhost:3010"];
export const CALLBACK_PATH = "/api/google/callback";

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** 리프레시 토큰이 더는 안 됨 (선생님이 구글에서 권한을 취소 등) */
    readonly revoked = false,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

function client() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET이 없습니다");
  return { id, secret };
}

export function googleClientConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ─── OAuth ────────────────────────────────────────────────────

/** prompt=consent: 다시 연결할 때도 리프레시 토큰을 받기 위해 */
export function authUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: client().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(body?.error ?? "");
    throw new GoogleError(`토큰 요청 실패: ${res.status} ${code}`, res.status, code === "invalid_grant");
  }
  return body as TokenResponse;
}

/** id_token은 구글 토큰 주소에서 TLS로 직접 받은 것이라 서명 확인 없이 내용만 읽는다 (OpenID Connect 규격이 허용) */
function emailOf(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export type Connection = { email: string; refreshToken: string; accessToken: string; expiresAt: number };

/** 콜백에서 받은 code를 토큰으로 바꾼다. 캘린더 권한을 빼고 허용했으면 오류 */
export async function exchangeCode(code: string, redirectUri: string, now = Date.now()): Promise<Connection> {
  const { id, secret } = client();
  const t = await postToken({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.scope?.split(" ").includes(CALENDAR_SCOPE)) throw new GoogleError("캘린더 권한이 없습니다", 403);
  const email = emailOf(t.id_token);
  if (!t.refresh_token || !email) throw new GoogleError("리프레시 토큰이나 이메일이 없습니다", 400);
  return { email, refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: now + t.expires_in * 1000 };
}

export async function refreshAccessToken(refreshToken: string, now = Date.now()) {
  const { id, secret } = client();
  const t = await postToken({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" });
  return { accessToken: t.access_token, expiresAt: now + t.expires_in * 1000 };
}

/** 연결 끊기. 실패해도(이미 취소됨 등) 앱 쪽 연결은 끊는다 */
export async function revokeToken(token: string) {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

// ─── Calendar ─────────────────────────────────────────────────

export type GoogleEvent = {
  id: string;
  status?: string;
  hangoutLink?: string;
  attendees?: { email: string }[];
  conferenceData?: { createRequest?: { status?: { statusCode?: string } }; entryPoints?: { entryPointType?: string; uri?: string }[] };
};

async function calendar<T>(accessToken: string, method: string, path: string, query: Record<string, string>, body?: unknown): Promise<T> {
  const url = `${EVENTS_URL}${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`캘린더 ${method} ${path} 실패: ${res.status} ${data?.error?.message ?? ""}`, res.status);
  return data as T;
}

/** 초대 메일은 보내지 않는다 (MEET-03) */
const NO_MAIL = { sendUpdates: "none", conferenceDataVersion: "1" };

export function meetLinkOf(e: GoogleEvent): string | null {
  if (e.hangoutLink) return e.hangoutLink;
  return e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
}

/** 슬롯 id로 정한 일정 id. 같은 슬롯에 일정이 두 번 생기지 않는다 (MEET-02). 구글 일정 id는 0-9, a-v만 쓴다 */
export function eventIdOf(slotId: string) {
  return slotId.replace(/-/g, "").toLowerCase();
}

export type NewEvent = { slotId: string; startsAt: Date; endsAt: Date; attendees: string[]; appUrl: string };

export function createEvent(accessToken: string, e: NewEvent) {
  return calendar<GoogleEvent>(accessToken, "POST", "", NO_MAIL, {
    id: eventIdOf(e.slotId),
    // 학생 캘린더에도 보일 수 있어서 학생 이름은 넣지 않는다
    summary: "Tutoring 영어 수업",
    description: `앱에서 들어가기: ${e.appUrl}`,
    start: { dateTime: e.startsAt.toISOString(), timeZone: "Asia/Seoul" },
    end: { dateTime: e.endsAt.toISOString(), timeZone: "Asia/Seoul" },
    attendees: e.attendees.map((email) => ({ email })),
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    reminders: { useDefault: false, overrides: [] },
    conferenceData: { createRequest: { requestId: e.slotId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
  });
}

export function getEvent(accessToken: string, eventId: string) {
  return calendar<GoogleEvent>(accessToken, "GET", `/${eventId}`, {});
}

export function patchEvent(accessToken: string, eventId: string, patch: Record<string, unknown>) {
  return calendar<GoogleEvent>(accessToken, "PATCH", `/${eventId}`, NO_MAIL, patch);
}

/** 이미 지워졌으면(404, 410) 성공으로 본다 */
export async function deleteEvent(accessToken: string, eventId: string) {
  try {
    await calendar<void>(accessToken, "DELETE", `/${eventId}`, { sendUpdates: "none" });
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}
