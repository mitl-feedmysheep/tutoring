import { prisma } from "@/lib/db/client";
import { hashPassword, validatePassword } from "./password";

// 로그인 화면이 선생님·학생 공용이라 이메일은 두 테이블을 합쳐서 하나만 있어야 한다

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailTaken(email: string) {
  const e = normalizeEmail(email);
  const [t, s] = await Promise.all([prisma.teacher.count({ where: { email: e } }), prisma.student.count({ where: { email: e } })]);
  return t + s > 0;
}

/** 선생님 계정 생성. 시스템 관리자(스크립트, 어드민 선생님 관리)만 호출한다 */
export async function createTeacher(input: {
  name: string;
  email: string;
  password: string;
  isAdmin?: boolean;
  /** 임시 비밀번호면 첫 로그인 때 바꾸게 한다 */
  mustChangePassword: boolean;
}) {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (!name || name.length > 50) throw new Error("이름은 1~50자입니다");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) throw new Error("이메일 형식이 아닙니다");
  const pwError = validatePassword(input.password);
  if (pwError) throw new Error(pwError);
  if (await isEmailTaken(email)) throw new Error("이미 쓰는 이메일입니다");

  return prisma.teacher.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(input.password),
      isAdmin: input.isAdmin ?? false,
      mustChangePassword: input.mustChangePassword,
    },
    select: { id: true, name: true, email: true, isAdmin: true, mustChangePassword: true },
  });
}
