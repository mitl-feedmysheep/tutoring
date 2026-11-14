import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { addMonths, dateKey, monthKey, monthOf, parseMonthKey, WEEKDAYS, type YearMonth } from "@/lib/schedule/kst";
import { daysAgo, studyOverview } from "@/lib/study/overview";
import { minutesText } from "@/lib/study/rules";
import { todayKey } from "@/lib/study/study";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "공부 기록" };

/** 마지막 기록이 이만큼(일) 지나면 눈에 띄게 */
const STALE_DAYS = 3;

// 어드민 공부 기록 (STUDY-10). 학생마다 그 달 하루하루 공부했는지, 연속 며칠째인지, 마지막 기록이 언제인지
export default async function StudyOverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { db } = await requireTeacher();
  const now = new Date();
  const thisMonth = monthOf(now);
  const asked = parseMonthKey((await searchParams).month);
  const ym = asked && monthKey(asked) <= monthKey(thisMonth) ? asked : thisMonth;
  const rows = await studyOverview(db, ym, now);
  const today = todayKey(now);

  const href = (m: YearMonth) => `/admin/study?month=${monthKey(m)}`;
  const arrow = "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted";
  const isLast = monthKey(ym) >= monthKey(thisMonth);
  const dayCount = rows[0]?.days.length ?? 0;
  const weekday = (d: number) => new Date(Date.UTC(ym.year, ym.month - 1, d)).getUTCDay();

  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-xl font-semibold">공부 기록</h1>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={href(addMonths(ym, -1))} aria-label="이전 달" className={arrow}>
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-24 text-center font-medium tabular-nums">
            {ym.year}년 {ym.month}월
          </span>
          {isLast ? (
            <span aria-hidden className={cn(arrow, "opacity-30 hover:bg-transparent")}>
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link href={href(addMonths(ym, 1))} aria-label="다음 달" className={arrow}>
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm bg-emerald-500" /> 공부함
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm bg-slate-200" /> 안 함
          </span>
          <span>연속·마지막 기록은 오늘 기준</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 달에 공부 기록을 볼 학생이 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">이름</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">연속</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">마지막 기록</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">이 달</th>
                {Array.from({ length: dayCount }, (_, i) => {
                  const w = weekday(i + 1);
                  return (
                    <th
                      key={i}
                      className={cn(
                        "w-5 px-0 py-2 text-center font-normal tabular-nums",
                        w === 0 && "text-rose-500",
                        w === 6 && "text-sky-600",
                        dateKey(ym.year, ym.month, i + 1) === today && "font-semibold text-foreground",
                      )}
                      title={`${ym.month}/${i + 1} (${WEEKDAYS[w]})`}
                    >
                      {i + 1}
                    </th>
                  );
                })}
                <th className="w-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ago = r.lastDate ? daysAgo(r.lastDate, now) : null;
                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2.5 font-medium whitespace-nowrap">
                      <Link href={`/admin/students/${r.id}?study=${monthKey(ym)}#study`} className="text-emerald-700 hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {r.streak > 0 ? <b className="font-semibold text-emerald-700">{r.streak}일째</b> : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right whitespace-nowrap tabular-nums", ago !== null && ago >= STALE_DAYS ? "font-medium text-rose-600" : "text-muted-foreground")}>
                      {ago === null ? <span className="font-medium text-rose-600">없음</span> : ago === 0 ? "오늘" : ago === 1 ? "어제" : `${ago}일 전`}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      <span className="font-medium">
                        {r.countedDays}일 중 {r.studiedDays}일
                      </span>
                      <span className="block text-xs text-muted-foreground">{minutesText(r.monthMinutes)}</span>
                    </td>
                    {r.days.map((m, i) => (
                      <td key={i} className="px-0 py-2.5 text-center">
                        <span
                          title={m === null ? undefined : `${ym.month}/${i + 1} ${m > 0 ? minutesText(m) : "안 함"}`}
                          className={cn(
                            "mx-auto block size-4 rounded-sm",
                            m === null ? "bg-transparent" : m > 0 ? "bg-emerald-500" : "bg-slate-200",
                            dateKey(ym.year, ym.month, i + 1) === today && "ring-2 ring-slate-400 ring-offset-1",
                          )}
                        />
                      </td>
                    ))}
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
