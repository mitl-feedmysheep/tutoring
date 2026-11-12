import { prisma } from "./client";

/** 스케줄러가 선생님마다 teacherDb를 만들 때 쓴다. 범위 밖 조회라 DB 계층에 둔다 */
export async function listTeacherIds() {
  const rows = await prisma.teacher.findMany({ where: { deletedAt: null }, select: { id: true } });
  return rows.map((r) => r.id);
}
