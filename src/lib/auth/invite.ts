import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { isEmailTaken, normalizeEmail } from "./accounts";
import { hashPassword, validatePassword } from "./password";
import { AuthError, type Account } from "./login";

// 초대 링크 확인과 가입. 링크로 들어온 사람은 아직 로그인 전이라 원본 클라이언트를 쓴다.
// 발급·목록·취소는 선생님 화면이라 src/lib/admin/invites.ts에서 teacherDb로 한다

export const INVITE_TTL_MS = 60 * 60 * 1000;

/** 링크에 넣을 원본 토큰과 DB에 넣을 해시 */
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteState = "ok" | "invalid" | "expired" | "used" | "revoked";

export function inviteState(invite: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): Exclude<InviteState, "invalid"> {
  if (invite.usedAt) return "used";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt <= now) return "expired";
  return "ok";
}

async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return prisma.invite.findFirst({
    where: { tokenHash: hashInviteToken(token), deletedAt: null, teacher: { deletedAt: null } },
    include: { teacher: { select: { name: true } } },
  });
}

/** 가입 화면을 보여줄 수 있는지 */
export async function checkInvite(token: string, now = new Date()): Promise<{ state: InviteState; teacherName?: string }> {
  const invite = await findInvite(token);
  if (!invite) return { state: "invalid" };
  const state = inviteState(invite, now);
  return state === "ok" ? { state, teacherName: invite.teacher.name } : { state };
}

const thisYear = () => new Date().getFullYear();

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력해 주세요").max(50, "이름은 50자 이하로 써 주세요"),
    birthYear: z.coerce
      .number({ error: "출생연도를 입력해 주세요" })
      .int("출생연도를 숫자로 입력해 주세요")
      .min(1920, "출생연도를 확인해 주세요")
      .refine((y) => y <= thisYear(), "출생연도를 확인해 주세요"),
    gender: z.enum(["MALE", "FEMALE"], { error: "성별을 골라 주세요" }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, "이메일은 100자 이하로 써 주세요")
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "이메일 형식이 아닙니다"),
    password: z.string(),
    confirm: z.string(),
    // AUTH-13: 개인정보 수집·이용 동의 (필수). 동의 시각은 학생 가입 시각과 같다
    agreePrivacy: z.literal(true, { error: "개인정보 수집·이용에 동의해야 가입할 수 있어요" }),
  })
  .superRefine((v, ctx) => {
    const error = validatePassword(v.password);
    if (error) ctx.addIssue({ code: "custom", path: ["password"], message: error });
    else if (v.password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "비밀번호가 서로 다릅니다" });
  });

export type SignupInput = z.input<typeof signupSchema>;

/**
 * 초대 링크로 학생 가입 (AUTH-03, AUTH-04). 링크를 발급한 선생님에게 소속된다.
 * 한 트랜잭션에서 링크를 "사용됨"으로 바꾸는 조건부 UPDATE가 1행일 때만 학생을 만든다 → 동시에 눌러도 한 명만 가입
 */
export async function signupWithInvite(token: string, input: SignupInput, now = new Date()): Promise<Account> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message);
  const v = parsed.data;

  const invite = await findInvite(token);
  if (!invite || inviteState(invite, now) !== "ok") throw new AuthError("사용할 수 없는 초대 링크입니다. 선생님께 새 링크를 받아 주세요");
  const email = normalizeEmail(v.email);
  if (await isEmailTaken(email)) throw new AuthError("이미 가입된 이메일입니다");
  const passwordHash = await hashPassword(v.password);

  try {
    const student = await prisma.$transaction(async (tx) => {
      const { count } = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null, revokedAt: null, deletedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) throw new AuthError("사용할 수 없는 초대 링크입니다. 선생님께 새 링크를 받아 주세요");
      const s = await tx.student.create({
        data: { teacherId: invite.teacherId, name: v.name, birthYear: v.birthYear, gender: v.gender, email, passwordHash },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { studentId: s.id } });
      return s;
    });
    return {
      claims: { role: "student", teacherId: student.teacherId, studentId: student.id, v: student.sessionVersion },
      name: student.name,
      isAdmin: false,
      mustChangePassword: false,
    };
  } catch (e) {
    // 확인과 저장 사이에 같은 이메일로 누가 가입한 경우
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AuthError("이미 가입된 이메일입니다");
    throw e;
  }
}
