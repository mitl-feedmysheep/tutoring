import type { Metadata } from "next";
import { requireStudent } from "@/lib/auth/session";
import { weeklyChoices, shortWeeklyText } from "@/lib/schedule/weekly";
import { SubScreen } from "@/components/app/screens";
import { Empty, Notice } from "@/components/app/ui";
import { WeeklyPicker } from "@/components/app/lessons/weekly-picker";

export const metadata: Metadata = { title: "고정 일정" };

// 고정 일정 고르기·바꾸기 (SCH-04, SCH-14). 선생님이 고정 시간을 바꾸거나 지우는 중이면 위에 노란 안내 (SCH-15)
export default async function WeeklyPage() {
  const ctx = await requireStudent();
  const choices = await weeklyChoices(ctx);

  const notices = choices.flatMap((c) => {
    if (c.ending) return [`${c.ending.month}월부터 ${shortWeeklyText(c)} 고정 수업이 없어져요. 선생님이 이 시간을 닫았어요.`];
    if (c.changing && c.mine) return [`${c.changing.from.month}월부터 ${shortWeeklyText(c.changing.old)} 수업이 ${shortWeeklyText(c)}으로 바뀌어요.`];
    return [];
  });

  return (
    <SubScreen title="고정 일정" fallback="/lessons">
      {notices.map((n) => (
        <Notice key={n}>{n}</Notice>
      ))}
      {choices.length === 0 ? (
        <Empty>선생님이 열어 둔 고정 수업 시간이 아직 없어요</Empty>
      ) : (
        <WeeklyPicker
          choices={choices.map((c) => ({
            id: c.id,
            weekday: c.weekday,
            startMinute: c.startMinute,
            endMinute: c.endMinute,
            mine: c.mine,
            note: c.ending ? `${c.ending.month}월부터 없어져요` : c.changing ? `${c.changing.from.month}월부터 이 시간 (지금은 ${shortWeeklyText(c.changing.old)})` : null,
            closed: c.ending !== null,
          }))}
        />
      )}
    </SubScreen>
  );
}
