import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { dateKey, dayLabel, parseDateKey } from "@/lib/schedule/kst";
import { minutesText } from "@/lib/study/rules";
import { dayEntries, editableDates, studyOwnerOf, toDbDate, todayKey } from "@/lib/study/study";
import { SubScreen } from "@/components/app/screens";
import { Empty, Rule } from "@/components/app/ui";
import { StudyDay } from "@/components/app/study/study-day";

export const metadata: Metadata = { title: "공부 기록" };

// 그날 공부 기록 화면 (APP-03). 오늘·어제는 바로 쓰고 고친다 (STUDY-02). 그저께부터는 잠근다
export default async function StudyDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date: raw } = await params;
  const d = parseDateKey(raw);
  if (!d) notFound();
  const date = dateKey(d.year, d.month, d.day);
  const now = new Date();
  if (date > todayKey(now)) notFound();

  const { claims } = await requireUser();
  const entries = await dayEntries(studyOwnerOf(claims), date);
  const locked = !editableDates(now).includes(date);
  const total = entries.reduce((s, e) => s + e.minutes, 0);

  return (
    <SubScreen title={`${dayLabel(toDbDate(date))} 공부 기록`} fallback="/study">
      {entries.length > 1 && (
        <p className="px-1 text-sm text-muted-foreground">
          이날 합계 <b className="font-bold text-primary tabular-nums">{minutesText(total)}</b>
        </p>
      )}
      {locked && <Rule>어제 기록까지만 고칠 수 있어요.</Rule>}
      {locked && entries.length === 0 ? <Empty>이날은 기록이 없어요.</Empty> : <StudyDay date={date} entries={entries} locked={locked} />}
    </SubScreen>
  );
}
