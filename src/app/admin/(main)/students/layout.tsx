import { StudentTabs } from "./student-tabs";

// 학생 관리: 학생 목록 / 초대 링크 탭
export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <h1 className="text-xl font-semibold">학생 관리</h1>
        <StudentTabs />
      </div>
      {children}
    </div>
  );
}
