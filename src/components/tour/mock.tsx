import { CalendarDays, Check, ChevronLeft, ChevronRight, PenLine, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysInMonth, kstParts, WEEKDAYS } from "@/lib/schedule/kst";

// 앱 둘러보기(AUTH-14)에서 쓰는 가짜 화면 조각. 실제 화면(screens.tsx, ui.tsx)과 같은 모양으로 그린다

export type MockTab = "/" | "/study" | "/my";

const TABS = [
  { href: "/", label: "수업", icon: CalendarDays },
  { href: "/study", label: "공부", icon: PenLine },
  { href: "/my", label: "MY", icon: User },
] as const;

/** 탭 첫 화면 틀: 위에 제목, 아래에 하단 탭 */
export function MockTabScreen({ title, action, tab, children }: { title: React.ReactNode; action?: React.ReactNode; tab: MockTab; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-3">
        <h1 className="min-w-0 truncate text-xl font-bold">{title}</h1>
        {action}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4">{children}</div>
      <nav className="border-t border-border/60 bg-background">
        <div className="flex h-14 items-center justify-around px-2">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === tab;
            return (
              <span key={href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-1", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className={cn("size-5", active && "fill-primary/15")} strokeWidth={active ? 2.5 : 2} />
                <span className={cn("text-[11px]", active ? "font-bold" : "font-medium")}>{label}</span>
              </span>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** 하위 화면 틀: 위에 ← 와 제목 */
export function MockSubScreen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center gap-1 px-4">
        <ChevronLeft className="size-6" />
        <h1 className="truncate text-base font-bold">{title}</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pt-1">{children}</div>
    </div>
  );
}

export function MockCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("divide-y divide-border overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--color-border)]", className)}>{children}</section>;
}

export function MockChip({ tone = "primary", children }: { tone?: "primary" | "gray"; children: React.ReactNode }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", tone === "primary" ? "bg-accent text-primary" : "bg-muted text-muted-foreground")}>
      {children}
    </span>
  );
}

/** 가짜 화면의 날짜는 오늘(KST)을 기준으로 만든다. 고정 수업은 매주 화·목 저녁 */
export function mockMonth() {
  const today = kstParts(new Date());
  const ym = { year: today.year, month: today.month };
  const firstWeekday = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay();
  const days = daysInMonth(ym);
  const weekdayOf = (day: number) => (firstWeekday + day - 1) % 7;
  const lessonDays = Array.from({ length: days }, (_, i) => i + 1).filter((d) => [2, 4].includes(weekdayOf(d)));
  // 다음 수업: 오늘 뒤의 화·목. 이번 달에 없으면 다음 달 첫 화·목
  let next = { month: ym.month, day: lessonDays.find((d) => d > today.day) ?? 0 };
  if (!next.day) {
    const nextYm = ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 };
    const w = new Date(Date.UTC(nextYm.year, nextYm.month - 1, 1)).getUTCDay();
    const day = Array.from({ length: 7 }, (_, i) => i + 1).find((d) => [2, 4].includes((w + d - 1) % 7))!;
    next = { month: nextYm.month, day };
  }
  const nextWeekday = next.month === ym.month ? weekdayOf(next.day) : new Date(Date.UTC(ym.year, next.month - 1, next.day)).getUTCDay();
  // 공부한 날: 오늘까지 중 대부분 (사흘에 하루쯤 빠진 날)
  const studied = Array.from({ length: today.day }, (_, i) => i + 1).filter((d) => d % 3 !== 0 || d === today.day);
  // 예약 수업 하나: 다음 수업 다음 토요일 (이번 달 안에 있으면)
  const booked = Array.from({ length: days }, (_, i) => i + 1).find((d) => d > today.day + 2 && weekdayOf(d) === 6) ?? null;
  return {
    ...ym,
    today: today.day,
    firstWeekday,
    days,
    lessonDays,
    booked,
    studied,
    nextText: `${next.month}/${String(next.day).padStart(2, "0")} (${WEEKDAYS[nextWeekday]})`,
  };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 수업 탭·공부 탭 달력. mark: 날짜 아래 표시 */
export function MockCalendar({ title, mark }: { title: string; mark: (day: number) => "fixed" | "booked" | "past" | "check" | null }) {
  const m = mockMonth();
  const cells: (number | null)[] = [...Array(m.firstWeekday).fill(null), ...Array.from({ length: m.days }, (_, i) => i + 1)];
  return (
    <section className="flex flex-col gap-1 rounded-xl bg-card p-2.5 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold">{title}</span>
        <span className="flex text-muted-foreground">
          <ChevronLeft className="size-5" />
          <ChevronRight className="size-5" />
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEK.map((d) => (
          <span key={d} className="py-0.5">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const kind = mark(day);
          return (
            <span
              key={day}
              className={cn(
                "flex h-9 flex-col items-center justify-center gap-0.5 rounded-lg text-[13px] text-foreground tabular-nums",
                day === m.today && "font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
                kind === null && day > m.today && "text-foreground/80",
              )}
            >
              <span>{day}</span>
              {kind === "check" ? (
                <span className="flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              ) : (
                <b
                  className={cn(
                    "block size-1.5 rounded-full",
                    kind === "fixed" && "bg-primary",
                    kind === "booked" && "shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
                    kind === "past" && "bg-muted-foreground/40",
                  )}
                />
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}
