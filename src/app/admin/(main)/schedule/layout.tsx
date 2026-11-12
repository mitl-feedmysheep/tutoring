import { PageTabs } from "@/components/admin/page-tabs";

// 일정: 달력 / 고정 수업 시간 탭
export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-4">
        <h1 className="text-xl font-semibold">일정</h1>
        <PageTabs
          tabs={[
            { name: "달력", href: "/admin/schedule" },
            { name: "고정 수업 시간", href: "/admin/schedule/weekly" },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
