import "server-only";
import { studentDb } from "@/lib/db/scope";

/** 학생의 담당 선생님 이름 (MY 탭). 학생 범위라 자기 선생님만 읽힌다. 비밀번호 해시 등은 꺼내지 않는다 */
export async function myTeacherName(teacherId: string, studentId: string) {
  const teacher = await studentDb(teacherId, studentId).teacher.findFirst({ select: { name: true } });
  return teacher?.name ?? null;
}
