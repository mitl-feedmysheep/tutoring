import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { materialViewUrl } from "@/lib/files/materials";

// 웹앱 자료실에서 PDF 열기 (APP-17). 학생은 나에게 공개된 자료만, 선생님은 내 자료 전부. 짧게 유효한 서명 URL로 보낸다 (NFR-04)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { claims } = await requireUser();
  const db = claims.role === "student" ? studentDb(claims.teacherId, claims.studentId) : teacherDb(claims.teacherId);
  const url = await materialViewUrl(db, (await params).id);
  if (!url) notFound();
  redirect(url);
}
