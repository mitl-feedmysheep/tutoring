import { requireTeacher } from "@/lib/auth/session";
import { AdminShell } from "./admin-shell";

// 레이아웃은 화면 이동 때 다시 그려지지 않으므로, 페이지·액션마다 requireTeacher를 따로 부른다
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account } = await requireTeacher();
  return <AdminShell teacherName={account.name} isAdmin={account.isAdmin}>{children}</AdminShell>;
}
