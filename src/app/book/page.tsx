import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/auth/session";
import { groupSlots } from "@/lib/app/slot-groups";
import { weeklyText } from "@/lib/app/lesson-format";
import { bookableSlots, myWeeklySchedule } from "@/lib/schedule/student";
import { SubScreen } from "@/components/app/screens";
import { Card, Empty, Row, Rule } from "@/components/app/ui";
import { SlotList } from "@/components/app/lessons/slot-list";

export const metadata: Metadata = { title: "수업 예약" };

// 수업 예약 (SCH-03, SCH-13). 만들어진 앞으로의 시간이 날짜별로 나온다. 누르면 바로 잡힌다.
// 맨 위에 고정 일정(SCH-04) 입구: 매주 같은 시간이면 하나씩 예약하지 않고 고정 일정으로 정한다
export default async function BookPage() {
  const ctx = await requireStudent();
  const [slots, weekly] = await Promise.all([bookableSlots(ctx), myWeeklySchedule(ctx)]);
  const groups = groupSlots(slots);
  return (
    <SubScreen title="수업 예약" fallback="/">
      <Card>
        <Link href="/lessons/weekly" className="block transition-colors hover:bg-accent/50">
          <Row>
            <span className="min-w-0">
              고정 일정
              <small className="ml-2 text-[13px] text-muted-foreground">{weekly.length ? weeklyText(weekly) : "매주 같은 시간에 수업해요"}</small>
            </span>
            <span className="shrink-0 text-sm font-bold text-primary">{weekly.length ? "바꾸기 ›" : "정하기 ›"}</span>
          </Row>
        </Link>
      </Card>
      <Rule>수업 시작 1시간 전까지 예약하고, 취소하거나 옮길 수 있어요.</Rule>
      {groups.length === 0 ? <Empty>예약할 수 있는 수업 시간이 아직 없어요</Empty> : <SlotList groups={groups} />}
    </SubScreen>
  );
}
