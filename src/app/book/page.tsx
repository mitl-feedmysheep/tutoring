import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth/session";
import { groupSlots } from "@/lib/app/slot-groups";
import { bookableSlots } from "@/lib/schedule/student";
import { SubScreen } from "@/components/app/screens";
import { Empty, Rule } from "@/components/app/ui";
import { SlotList } from "@/components/app/lessons/slot-list";

export const metadata: Metadata = { title: "수업 예약" };

// 수업 예약 (SCH-03, SCH-13). 만들어진 앞으로의 시간이 날짜별로 나온다. 누르면 바로 잡힌다
export default async function BookPage() {
  const ctx = await requireStudent();
  const groups = groupSlots(await bookableSlots(ctx));
  return (
    <SubScreen title="수업 예약" fallback="/">
      <Rule>수업 시작 1시간 전까지 예약하고, 취소하거나 옮길 수 있어요.</Rule>
      {groups.length === 0 ? <Empty>예약할 수 있는 수업 시간이 아직 없어요</Empty> : <SlotList groups={groups} />}
    </SubScreen>
  );
}
