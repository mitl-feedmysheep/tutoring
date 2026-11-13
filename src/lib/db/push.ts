import { prisma } from "./client";

/**
 * 기기의 푸시 구독을 이 사람 것으로 저장한다 (없으면 만들고, 지웠으면 되살리고, 남의 것이면 옮긴다).
 * 범위 계층 밖에서 쓰는 이유: 같은 기기에서 전에 다른 사람이(다른 선생님의 학생이어도) 켰던 행을 옮겨야 해서.
 * 기기 주소는 그 브라우저만 알 수 있는 값이라 옮겨도 되고, 옛 주인의 내용은 돌려주지 않는다.
 * owner는 반드시 서버 세션에서 꺼낸 값
 */
export async function claimPushEndpoint(
  owner: { teacherId: string; studentId: string | null },
  endpoint: string,
  data: { p256dh: string; auth: string; userAgent: string | null },
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { ...owner, endpoint, ...data },
    update: { ...owner, ...data, deletedAt: null },
    select: { id: true },
  });
}
