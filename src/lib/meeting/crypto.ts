import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 구글 리프레시 토큰 암호화 (AES-256-GCM). 키는 MEETING_TOKEN_KEY (32바이트를 base64로).
// DB가 새도 토큰만으로는 선생님 캘린더에 접근할 수 없게 한다. 저장 형식: v1.<iv>.<tag>.<암호문> (모두 base64url)

function key(): Buffer | null {
  const raw = process.env.MEETING_TOKEN_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("MEETING_TOKEN_KEY는 32바이트를 base64로 적은 값이어야 합니다");
  return buf;
}

export function tokenKeyConfigured(): boolean {
  return key() !== null;
}

function requireKey(): Buffer {
  const k = key();
  if (!k) throw new Error("MEETING_TOKEN_KEY가 없습니다");
  return k;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(stored: string): string {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("알 수 없는 토큰 형식입니다");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
