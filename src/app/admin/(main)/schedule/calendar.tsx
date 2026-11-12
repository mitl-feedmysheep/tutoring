"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FormError } from "@/components/auth/auth-card";
import { cn } from "@/lib/utils";
import { WEEKDAYS, daysInMonth, dateKey, formatMinute } from "@/lib/schedule/kst";
import { createOneOffSlotAction, deleteSlotAction } from "@/app/admin/schedule-actions";

export type CalendarSlot = {
  id: string;
  /** KST 날짜 "2026-12-15" */
  date: string;
  /** KST 자정부터 분 */
  start: number;
  end: number;
  /** 고정 수업 시간에서 만들어진 슬롯 */
  weekly: boolean;
  past: boolean;
  students: { name: string; fixed: boolean }[];
};

type Selection = { kind: "date"; date: string } | { kind: "slot"; id: string } | null;

type Props = {
  year: number;
  month: number;
  today: string;
  prevKey: string;
  nextKey: string;
  thisMonthKey: string;
  notGeneratedYet: boolean;
  slots: CalendarSlot[];
};

/** 월요일부터 */
const COLUMNS = [1, 2, 3, 4, 5, 6, 0];

/** 오른쪽 패널을 달력 옆에 고정으로 두는 폭 (xl). 그보다 좁으면 눌렀을 때 패널이 밀려 나온다 */
const DESKTOP = "(min-width: 1280px)";
/** 태블릿은 오른쪽에서, 폰은 아래에서 */
const TABLET = "(min-width: 768px)";
function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function dateLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

const timeRange = (s: CalendarSlot) => `${formatMinute(s.start)}–${formatMinute(s.end)}`;

const slotColor = (s: CalendarSlot) =>
  s.weekly ? "border-indigo-200 bg-indigo-50 text-indigo-950" : "border-amber-200 bg-amber-50 text-amber-950";

/**
 * 달력 + 상세 패널. 날짜 칸에는 슬롯 카드(시작 시간·예약 인원)만 두고, 누르면 오른쪽 패널에 자세히 보여 준다.
 * 넓은 PC는 패널이 달력 옆에 고정, 태블릿은 오른쪽에서 밀려 나오고, 폰은 아래에서 올라온다 (폰은 칸이 좁아서 카드 대신 점)
 */
export function ScheduleCalendar({ year, month, today, prevKey, nextKey, thisMonthKey, notGeneratedYet, slots }: Props) {
  const isDesktop = useMedia(DESKTOP);
  const isTablet = useMedia(TABLET);
  const [selection, setSelection] = useState<Selection>(today.startsWith(`${year}-${String(month).padStart(2, "0")}`) ? { kind: "date", date: today } : null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    for (const s of slots) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return map;
  }, [slots]);

  function select(next: Selection) {
    setSelection(next);
    if (!isDesktop) setSheetOpen(true);
  }

  const days = daysInMonth({ year, month });
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const selectedDate = selection?.kind === "date" ? selection.date : undefined;
  const selectedSlotId = selection?.kind === "slot" ? selection.id : undefined;
  const prevMonth = month === 1 ? 12 : month - 1;

  const panel = <DetailPanel selection={selection} slots={slots} byDate={byDate} today={today} onSelect={setSelection} />;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="grid min-w-0 grid-cols-1 content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon-sm">
              <Link href={`/admin/schedule?month=${prevKey}`} aria-label="이전 달">
                <ChevronLeft />
              </Link>
            </Button>
            <h2 className="min-w-28 text-center text-lg font-semibold tabular-nums">
              {year}년 {month}월
            </h2>
            <Button asChild variant="outline" size="icon-sm">
              <Link href={`/admin/schedule?month=${nextKey}`} aria-label="다음 달">
                <ChevronRight />
              </Link>
            </Button>
            {`${year}-${String(month).padStart(2, "0")}` !== thisMonthKey && (
              <Button asChild variant="ghost" size="sm" className="ml-1">
                <Link href="/admin/schedule">이번 달</Link>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-indigo-300 bg-indigo-100" />
              고정 수업
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-amber-300 bg-amber-100" />
              1회성
            </span>
          </div>
        </div>

        {notGeneratedYet && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            이 달의 고정 수업 슬롯은 {prevMonth}월 마지막 날 자동으로 만들어져요. 1회성 슬롯은 지금 추가할 수 있어요.
          </p>
        )}

        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-medium text-muted-foreground">
            {COLUMNS.map((wd) => (
              <div key={wd} className={cn("py-2", wd === 0 && "text-red-500", wd === 6 && "text-blue-500")}>
                {WEEKDAYS[wd]}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const border = cn("border-b border-r", i % 7 === 6 && "border-r-0", i >= cells.length - 7 && "border-b-0");
              if (day === null) return <div key={`blank-${i}`} className={cn(border, "bg-slate-50/60")} />;
              const date = dateKey(year, month, day);
              const daySlots = byDate.get(date) ?? [];
              const wd = COLUMNS[i % 7];
              const isPast = date < today;
              return (
                // 칸 아무 곳이나 눌러도 그 날짜가 열린다. 키보드는 날짜 숫자 버튼으로
                <div
                  key={date}
                  onClick={() => select({ kind: "date", date })}
                  className={cn(
                    border,
                    "@container min-h-16 min-w-0 cursor-pointer p-1 transition-colors hover:bg-slate-50 sm:min-h-28 sm:p-1.5",
                    isPast && "bg-slate-50/60",
                    selectedDate === date && "bg-indigo-50/70 hover:bg-indigo-50/70",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      select({ kind: "date", date });
                    }}
                    aria-label={dateLabel(date)}
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-xs tabular-nums sm:text-sm",
                      wd === 0 && "text-red-500",
                      wd === 6 && "text-blue-500",
                      isPast && "opacity-50",
                      date === today && "bg-indigo-600 font-semibold text-white opacity-100",
                    )}
                  >
                    {day}
                  </button>

                  <div className="mt-1 hidden gap-1 sm:grid">
                    {daySlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          select({ kind: "slot", id: s.id });
                        }}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-1 overflow-hidden rounded border px-1 py-0.5 text-left text-xs whitespace-nowrap tabular-nums transition-shadow hover:shadow-sm @[88px]:px-1.5",
                          slotColor(s),
                          s.past && "opacity-50",
                          selectedSlotId === s.id && "ring-2 ring-indigo-500 ring-offset-1",
                        )}
                      >
                        <span className="font-medium">{formatMinute(s.start)}</span>
                        {/* 칸이 좁으면 "명"을 빼고 숫자만 */}
                        <span className={cn(s.students.length === 0 && "opacity-50")}>
                          {s.students.length}
                          <span className="hidden @[88px]:inline">명</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {daySlots.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                      {daySlots.map((s) => (
                        <span key={s.id} className={cn("size-1.5 rounded-full", s.weekly ? "bg-indigo-500" : "bg-amber-500", s.past && "opacity-40")} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="hidden xl:block">
        <div className="sticky top-6 rounded-lg border bg-background p-4">{panel}</div>
      </aside>

      <Sheet open={sheetOpen && !isDesktop} onOpenChange={setSheetOpen}>
        <SheetContent
          side={isTablet ? "right" : "bottom"}
          className={cn(
            "gap-0 overflow-y-auto p-4",
            isTablet ? "w-[360px] pt-12 sm:max-w-[360px]" : "max-h-[85dvh] rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          <SheetTitle className="sr-only">일정 자세히</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailPanel({
  selection,
  slots,
  byDate,
  today,
  onSelect,
}: {
  selection: Selection;
  slots: CalendarSlot[];
  byDate: Map<string, CalendarSlot[]>;
  today: string;
  onSelect: (s: Selection) => void;
}) {
  if (selection?.kind === "slot") {
    const slot = slots.find((s) => s.id === selection.id);
    if (slot) return <SlotDetail slot={slot} onSelect={onSelect} />;
  }
  if (selection?.kind === "date") {
    return <DateDetail date={selection.date} slots={byDate.get(selection.date) ?? []} today={today} onSelect={onSelect} />;
  }
  return <p className="py-8 text-center text-sm text-muted-foreground">날짜나 수업을 누르면 여기에 자세히 보여요.</p>;
}

function DateDetail({ date, slots, today, onSelect }: { date: string; slots: CalendarSlot[]; today: string; onSelect: (s: Selection) => void }) {
  return (
    <div className="grid gap-5">
      <h3 className="text-lg font-semibold">{dateLabel(date)}</h3>

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">이 날은 수업 슬롯이 없어요.</p>
      ) : (
        <ul className="grid gap-2">
          {slots.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "slot", id: s.id })}
                className={cn("flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-shadow hover:shadow-sm", slotColor(s), s.past && "opacity-60")}
              >
                <span className="font-medium tabular-nums">{timeRange(s)}</span>
                <span className="text-xs">
                  {s.weekly ? "고정" : "1회성"} · {s.students.length}명
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {date >= today ? (
        <OneOffForm key={date} date={date} />
      ) : (
        <p className="text-xs text-muted-foreground">지난 날짜에는 슬롯을 추가할 수 없어요.</p>
      )}
    </div>
  );
}

function OneOffForm({ date }: { date: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <form
      className="grid gap-2 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => {
          const res = await createOneOffSlotAction(form);
          if (res.ok) {
            setError(undefined);
            toast.success("1회성 슬롯을 추가했어요");
          } else setError(res.error);
        });
      }}
    >
      <p className="text-sm font-medium">1회성 슬롯 추가</p>
      <input type="hidden" name="date" value={date} />
      <div className="flex items-center gap-2">
        <Input type="time" name="start" step={300} defaultValue="19:00" required aria-label="시작 시간" />
        <span className="text-muted-foreground">–</span>
        <Input type="time" name="end" step={300} defaultValue="20:00" required aria-label="끝나는 시간" />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "추가하는 중..." : "추가"}
      </Button>
    </form>
  );
}

function SlotDetail({ slot, onSelect }: { slot: CalendarSlot; onSelect: (s: Selection) => void }) {
  const [pending, start] = useTransition();
  const n = slot.students.length;

  function remove() {
    const parts = [
      n > 0 ? `예약한 학생 ${n}명의 수업도 함께 취소돼요.` : "",
      slot.weekly ? "고정 수업 시간은 그대로 두고 이 날만 쉬어요." : "",
      "이 슬롯을 지울까요?",
    ];
    if (!confirm(parts.filter(Boolean).join("\n"))) return;
    start(async () => {
      const res = await deleteSlotAction(slot.id);
      if (res.ok) {
        toast.success("슬롯을 지웠어요");
        onSelect({ kind: "date", date: slot.date });
      } else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-5">
      <button type="button" onClick={() => onSelect({ kind: "date", date: slot.date })} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {dateLabel(slot.date)}
      </button>

      <div className="grid gap-1.5">
        <p className="text-2xl font-semibold tabular-nums">{timeRange(slot)}</p>
        <span className={cn("w-fit rounded border px-1.5 py-0.5 text-xs", slotColor(slot))}>{slot.weekly ? "고정 수업 시간" : "1회성 슬롯"}</span>
      </div>

      <section className="grid gap-2">
        <h4 className="text-sm font-medium">예약한 학생 {n}명</h4>
        {n === 0 ? (
          <p className="text-sm text-muted-foreground">아직 예약한 학생이 없어요.</p>
        ) : (
          <ul className="grid gap-1">
            {slot.students.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                {s.name}
                {s.fixed && <span className="text-xs text-muted-foreground">고정 일정</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {slot.past ? (
        <p className="text-xs text-muted-foreground">이미 시작했거나 지난 수업은 바꿀 수 없어요.</p>
      ) : (
        <Button variant="outline" className="text-destructive hover:text-destructive" disabled={pending} onClick={remove}>
          {pending ? "지우는 중..." : "슬롯 삭제"}
        </Button>
      )}
    </div>
  );
}
