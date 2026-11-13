import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReplaceLink } from "@/components/app/nav";

export type StudyCalendarView = {
  year: number;
  month: number;
  /** 1일의 요일 (0=일) */
  firstWeekday: number;
  days: number;
  /** 이번 달이면 오늘 날짜. 지난 달이면 말일 다음(전부 누를 수 있음), 다음 달이면 0 */
  today: number;
  isThisMonth: boolean;
  /** 기록한 날 */
  studied: number[];
  hrefOf: (day: number) => string;
  prevHref: string;
  nextHref: string | null;
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

// 공부 탭 달력 (STUDY-03, APP-03). 일요일 시작, 기록한 날 체크. 오늘까지의 날짜를 누르면 그날 공부 기록 화면
export function StudyCalendar({ view }: { view: StudyCalendarView }) {
  const studied = new Set(view.studied);
  const cells: (number | null)[] = [...Array(view.firstWeekday).fill(null), ...Array.from({ length: view.days }, (_, i) => i + 1)];
  const arrow = "flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent";

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-3 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-center justify-between px-1">
        <span className="text-[15px] font-bold">
          {view.year}년 {view.month}월
        </span>
        <div className="flex">
          <ReplaceLink href={view.prevHref} aria-label="이전 달" className={arrow}>
            <ChevronLeft className="size-5" />
          </ReplaceLink>
          {view.nextHref ? (
            <ReplaceLink href={view.nextHref} aria-label="다음 달" className={arrow}>
              <ChevronRight className="size-5" />
            </ReplaceLink>
          ) : (
            <span aria-hidden className={cn(arrow, "opacity-30 hover:bg-transparent")}>
              <ChevronRight className="size-5" />
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {WEEK.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const done = studied.has(day);
          const className = cn(
            "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm text-foreground tabular-nums",
            view.isThisMonth && view.today === day && "font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
          );
          const inner = (
            <>
              <span>{day}</span>
              {done ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={3} aria-label="기록함" />
                </span>
              ) : (
                <span className="size-4" />
              )}
            </>
          );
          if (day > view.today) return <span key={day} className={cn(className, "text-muted-foreground/50")}>{inner}</span>;
          return (
            <Link key={day} href={view.hrefOf(day)} className={cn(className, "transition-colors hover:bg-accent")}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
