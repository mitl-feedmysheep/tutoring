import { redirect } from "next/navigation";

// 예전 자료 화면 주소. 이제 자료실 목록 오른쪽 창에서 본다 (FILE-03, 05)
export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/files?open=${encodeURIComponent(id)}`);
}
