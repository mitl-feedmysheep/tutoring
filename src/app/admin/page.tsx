import { redirect } from "next/navigation";

// 대시보드 구성은 추후 결정 (ADMIN-03). 지금은 학생 목록으로 보낸다
export default function AdminHome() {
  redirect("/admin/students");
}
