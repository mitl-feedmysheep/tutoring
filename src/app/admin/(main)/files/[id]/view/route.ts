import { notFound, redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth/session";
import { materialViewUrl } from "@/lib/files/materials";

// 어드민에서 자료 PDF 열기. 권한을 확인하고 짧게 유효한 서명 URL로 보낸다 (NFR-04)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireTeacher();
  const url = await materialViewUrl(db, (await params).id);
  if (!url) notFound();
  redirect(url);
}
