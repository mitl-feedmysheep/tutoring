import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth/session";
import { listWeeklySlots } from "@/lib/schedule/teacher";
import { WeeklyManager } from "./weekly-manager";

export const metadata: Metadata = { title: "고정 수업 시간" };

export default async function WeeklyPage() {
  const { db } = await requireTeacher();
  const weekly = await listWeeklySlots(db);
  return (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-sm text-muted-foreground">
        매주 반복되는 수업 시간이에요. 등록하면 이번 달 남은 날짜의 슬롯이 바로 만들어지고, 매달 마지막 날 다음 달 슬롯이 만들어져요. 특정 날만
        쉬려면 달력에서 그 날 슬롯을 지워 주세요.
      </p>
      <WeeklyManager weekly={weekly} />
    </div>
  );
}
