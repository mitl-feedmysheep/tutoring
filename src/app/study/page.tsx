import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { TabScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "공부" };

// 공부 탭 (APP-03)
export default async function StudyTab() {
  await requireUser();
  return (
    <TabScreen title="공부">
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        공부 시간 합계, 달력, 지난 기록이 여기에 나와요.
      </div>
    </TabScreen>
  );
}
