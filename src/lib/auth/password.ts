import bcrypt from "bcryptjs";

const COST = 12;

/** 비밀번호 규칙. 가입·변경·계정 생성에서 같이 쓴다 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다";
  if (password.length > 72) return "비밀번호는 72자 이하여야 합니다"; // bcrypt 한도
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
