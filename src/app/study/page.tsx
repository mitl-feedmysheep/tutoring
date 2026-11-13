import type { Metadata } from "next";
import Link from "next/link";
import { Image as ImageIcon, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { addMonths, dateKey, dayLabel, daysInMonth, kstParts, monthKey, monthOf, parseMonthKey } from "@/lib/schedule/kst";
import { minutesText } from "@/lib/study/rules";
import { monthEntries, studyOwnerOf, studySummary, toDbDate, todayKey, type StudyEntry, type StudyTotal } from "@/lib/study/study";
import { TabScreen } from "@/components/app/screens";
import { Card, Empty, GroupTitle } from "@/components/app/ui";
import { StudyCalendar } from "@/components/app/study/study-calendar";

export const metadata: Metadata = { title: "공부" };

// 공부 탭 (APP-03). 위에서부터 합계, 오늘 기록하기, 달력, 그 달 기록 목록.
// 학생은 내 기록, 선생님은 본인 기록 (STUDY-08, APP-05. 학생에게 보이지 않는다)
export default async function StudyTab({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { claims } = await requireUser();
  const owner = studyOwnerOf(claims);
  const now = new Date();
  const thisMonth = monthOf(now);
  const asked = parseMonthKey((await searchParams).month);
  // 다음 달부터는 기록이 없으니 이번 달까지만
  const ym = asked && monthKey(asked) <= monthKey(thisMonth) ? asked : thisMonth;
  const isThisMonth = monthKey(ym) === monthKey(thisMonth);

  const [summary, entries] = await Promise.all([studySummary(owner, now), monthEntries(owner, ym)]);
  const today = todayKey(now);

  const byDate = new Map<string, StudyEntry[]>();
  for (const e of entries) (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);

  return (
    <TabScreen title="공부">
      <section className="grid grid-cols-3 divide-x divide-border rounded-xl bg-card py-3.5 shadow-[0_0_0_1px_var(--color-border)]">
        <Total label="이번 주" total={summary.week} />
        <Total label="이번 달" total={summary.month} />
        <Total label="누적" total={summary.all} />
      </section>

      <Link href={`/study/${today}`} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground">
        <PenLine className="size-4" />
        오늘 공부 기록하기
      </Link>

      <StudyCalendar
        view={{
          ...ym,
          firstWeekday: new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay(),
          days: daysInMonth(ym),
          today: isThisMonth ? kstParts(now).day : daysInMonth(ym),
          isThisMonth,
          studied: [...byDate.keys()].map((k) => Number(k.slice(8))),
          hrefOf: (day) => `/study/${dateKey(ym.year, ym.month, day)}`,
          prevHref: `/study?month=${monthKey(addMonths(ym, -1))}`,
          nextHref: isThisMonth ? null : `/study?month=${monthKey(addMonths(ym, 1))}`,
        }}
      />

      <GroupTitle>{isThisMonth ? "이번 달 기록" : `${ym.month}월 기록`}</GroupTitle>
      {byDate.size === 0 ? (
        <Empty>{isThisMonth ? "이번 달 기록이 아직 없어요." : `${ym.month}월에는 기록이 없어요.`}</Empty>
      ) : (
        <Card>
          {[...byDate].map(([date, list]) => (
            <DayRow key={date} date={date} list={list} />
          ))}
        </Card>
      )}
    </TabScreen>
  );
}

function Total({ label, total }: { label: string; total: StudyTotal }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 text-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className="text-[15px] font-bold tabular-nums">{minutesText(total.minutes)}</b>
      <span className="text-xs text-muted-foreground tabular-nums">
        {total.days}일 중 <b className="font-bold text-primary">{total.studiedDays}일</b>
      </span>
    </div>
  );
}

function DayRow({ date, list }: { date: string; list: StudyEntry[] }) {
  const minutes = list.reduce((s, e) => s + e.minutes, 0);
  const photos = list.reduce((s, e) => s + e.photos.length, 0);
  const memo = list.map((e) => e.memo).filter(Boolean).join("\n");
  return (
    <Link href={`/study/${date}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/50">
      <div className="flex items-center justify-between gap-3 text-[15px] tabular-nums">
        <span className="font-semibold">{dayLabel(toDbDate(date))}</span>
        <span className="flex items-center gap-2">
          {photos > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5" />
              {photos}
            </span>
          )}
          <b className="font-bold text-primary">{minutesText(minutes)}</b>
        </span>
      </div>
      {memo && <p className="line-clamp-2 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">{memo}</p>}
    </Link>
  );
}
