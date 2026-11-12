import { PageTabs } from "@/components/admin/page-tabs";

// 학생 관리: 학생 목록 / 초대 링크 탭
export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-4">
        <h1 className="text-xl font-semibold">학생 관리</h1>
        <PageTabs
          tabs={[
            { name: "학생 목록", href: "/admin/students" },
            { name: "초대 링크", href: "/admin/students/invites" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
