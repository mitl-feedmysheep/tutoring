// 브라우저 쪽 웹 푸시 도우미 (클라이언트 컴포넌트에서만 쓴다)

export type PushSupport = "ok" | "ios-install" | "unsupported";

export function isIos() {
  const ua = navigator.userAgent;
  // 아이패드는 PC 사파리처럼 보이므로 터치로 구분한다
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** 아이폰은 홈 화면에 추가한 앱에서만 푸시가 된다 (iOS 16.4 이상) */
export function pushSupport(): PushSupport {
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ok) return "ok";
  if (isIos() && !isStandalone()) return "ios-install";
  return "unsupported";
}

/** 이 기기의 지금 구독. 없거나 지원하지 않으면 null */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** 알림 권한을 묻고 구독한다. 이미 있으면 그대로 쓴다 */
export async function subscribe(publicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/** 알림을 켠다: 허용 창 → 구독 → 서버 저장. 허용하지 않으면 그 상태를 돌려준다 */
export async function enablePush(publicKey: string, save: (sub: PushSubscriptionJSON) => Promise<{ ok: boolean }>): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const sub = await subscribe(publicKey);
  const res = await save(sub.toJSON());
  if (!res.ok) throw new Error("save failed");
  return permission;
}

// 로그인 뒤 알림 권유 창(APP-19)을 이 기기에서 이미 보여 줬는지. 로그아웃하면 지워서 다음 사람에게 다시 보인다
const PROMPTED_KEY = "tutoring.push.prompted";

export function wasPrompted() {
  try {
    return localStorage.getItem(PROMPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPrompted() {
  try {
    localStorage.setItem(PROMPTED_KEY, "1");
  } catch {}
}

export function clearPrompted() {
  try {
    localStorage.removeItem(PROMPTED_KEY);
  } catch {}
}
