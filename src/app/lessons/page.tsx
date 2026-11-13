import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/auth/session";
import { sameKstDay } from "@/lib/app/lesson-format";
import { clockText, dayLabel, formatMinute, kstParts, WEEKDAYS } from "@/lib/schedule/kst";
import { myWeeklySchedule, pastLessons, upcomingLessons, type MyLesson } from "@/lib/schedule/student";
import { SubScreen } from "@/components/app/screens";
import { ReplaceLink } from "@/components/app/nav";
import { Card, Chip, Empty, GroupTitle, Row } from "@/components/app/ui";
import { AttendanceChip } from "@/components/app/lessons/attendance-chip";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "내 수업" };

// 내 수업 (전체 보기, APP-02). 맨 위 고정 일정, 아래 예정 / 지난 수업
export default async function MyLessons({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireStudent();
  const past = (await searchParams).tab === "past";
  const now = new Date();
  const [weekly, lessons] = await Promise.all([myWeeklySchedule(ctx), past ? pastLessons(ctx, now) : upcomingLessons(ctx, now)]);

  return (
    <SubScreen title="내 수업" fallback="/">
      <Card>
        <Link href="/lessons/weekly" className="block transition-colors hover:bg-accent/50">
          <Row>
            <span className="min-w-0">
              고정 일정
              <small className="ml-2 text-[13px] text-muted-foreground">{weeklyText(weekly)}</small>
            </span>
            <span className="shrink-0 text-sm font-bold text-primary">{weekly.length ? "바꾸기 ›" : "정하기 ›"}</span>
          </Row>
        </Link>
      </Card>

      <div className="grid grid-cols-2 rounded-xl bg-muted p-1 text-center text-sm">
        <Segment href="/lessons" on={!past}>
          예정
        </Segment>
        <Segment href="/lessons?tab=past" on={past}>
          지난 수업
        </Segment>
      </div>

      {lessons.length === 0 ? (
        <Empty>{past ? "지난 수업이 없어요" : "예정된 수업이 없어요"}</Empty>
      ) : (
        groupByMonth(lessons, now).map((g) => (
          <div key={g.title} className="flex flex-col gap-4">
            <GroupTitle>{g.title}</GroupTitle>
            <Card>
              {g.lessons.map((l) => (
                <Link key={l.id} href={`/lessons/${l.id}`} className="block transition-colors hover:bg-accent/50">
                  <Row>
                    <span>
                      {dayLabel(l.startsAt)} {clockText(l.startsAt)}
                      {!past && sameKstDay(l.startsAt, now) && <small className="ml-2 text-[13px] text-muted-foreground">오늘</small>}
                    </span>
                    {past ? <AttendanceChip value={l.attendance} /> : <Chip>{l.fixed ? "고정" : "예약"}</Chip>}
                  </Row>
                </Link>
              ))}
            </Card>
          </div>
        ))
      )}
    </SubScreen>
  );
}

function Segment({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <ReplaceLink href={href} className={cn("rounded-lg py-2", on ? "bg-card font-bold shadow-sm" : "text-muted-foreground")}>
      {children}
    </ReplaceLink>
  );
}

/** "매주 화 · 목 19:00". 시간이 다르면 "매주 화 19:00 · 목 20:00" */
function weeklyText(weekly: { weekday: number; startMinute: number }[]) {
  if (weekly.length === 0) return "없음";
  const times = new Set(weekly.map((w) => w.startMinute));
  if (times.size === 1) return `매주 ${weekly.map((w) => WEEKDAYS[w.weekday]).join(" · ")} ${formatMinute(weekly[0].startMinute)}`;
  return `매주 ${weekly.map((w) => `${WEEKDAYS[w.weekday]} ${formatMinute(w.startMinute)}`).join(" · ")}`;
}

/** 달별로 묶는다. 올해가 아니면 연도도 쓴다 */
function groupByMonth(lessons: MyLesson[], now: Date) {
  const thisYear = kstParts(now).year;
  const groups: { title: string; lessons: MyLesson[] }[] = [];
  for (const l of lessons) {
    const p = kstParts(l.startsAt);
    const title = p.year === thisYear ? `${p.month}월` : `${p.year}년 ${p.month}월`;
    const last = groups[groups.length - 1];
    if (last?.title === title) last.lessons.push(l);
    else groups.push({ title, lessons: [l] });
  }
  return groups;
}
