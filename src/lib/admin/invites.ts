import type { ScopedDb } from "@/lib/db/scope";
import { INVITE_TTL_MS, inviteState, newInviteToken } from "@/lib/auth/invite";

// 선생님의 초대 링크 발급·목록·취소 (AUTH-01, AUTH-02, AUTH-09). db는 세션에서 만든 teacherDb

/**
 * 새 링크를 발급하고 원본 토큰을 돌려준다. 원본은 DB에 남지 않아서 이때만 보여줄 수 있다.
 * teacherId는 세션 값. 범위 계층이 db의 범위와 같은지 다시 확인한다
 */
export async function issueInvite(db: ScopedDb, teacherId: string, memo: string | undefined, now = new Date()) {
  const m = memo?.trim() || null;
  if (m && m.length > 50) throw new Error("메모는 50자 이하로 써 주세요");
  const { token, tokenHash } = newInviteToken();
  const invite = await db.invite.create({
    data: { teacherId, tokenHash, memo: m, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
    select: { id: true, expiresAt: true },
  });
  return { ...invite, token };
}

export async function listInvites(db: ScopedDb, now = new Date()) {
  const rows = await db.invite.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      memo: true,
      createdAt: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      student: { select: { name: true } },
    },
  });
  return rows.map((r) => ({ ...r, state: inviteState(r, now) }));
}

/** 아직 쓰지 않았고 만료 전인 링크만 취소된다. 취소했으면 true */
export async function revokeInvite(db: ScopedDb, id: string, now = new Date()) {
  const { count } = await db.invite.updateMany({
    where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });
  return count === 1;
}
