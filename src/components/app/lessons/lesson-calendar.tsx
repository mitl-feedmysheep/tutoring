"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReplaceLink } from "@/components/app/nav";
import { startNav } from "@/components/app/nav-progress";
import { BottomSheet } from "./bottom-sheet";

export type CalendarLesson = { id: string; time: string; kind: "fixed" | "booked"; past: boolean };

export type CalendarView = {
  year: number;
  month: number;
  /** 1일의 요일 (0=일) */
  firstWeekday: number;
  days: number;
  /** 이번 달이면 오늘 날짜 */
  today: number | null;
  lessons: Record<number, CalendarLesson[]>;
  prevHref: string;
  nextHref: string;
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 하루에 수업이 여럿이면 점 하나로: 앞으로의 고정 > 앞으로의 예약 > 지난 수업 */
function dotOf(lessons: CalendarLesson[]) {
  const upcoming = lessons.filter((l) => !l.past);
  if (upcoming.length === 0) return "past";
  return upcoming.some((l) => l.kind === "fixed") ? "fixed" : "booked";
}

function Dot({ kind }: { kind: "fixed" | "booked" | "past" | null }) {
  return (
    <b
      className={cn(
        "block size-1.5 rounded-full",
        kind === "fixed" && "bg-primary",
        kind === "booked" && "shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
        kind === "past" && "bg-muted-foreground/40",
      )}
    />
  );
}

// 수업 탭 이번 달 수업 달력 (APP-02). 일요일 시작, 수업 있는 날 점
export function LessonCalendar({ view }: { view: CalendarView }) {
  const router = useRouter();
  const [picking, setPicking] = useState<number | null>(null);
  const cells: (number | null)[] = [...Array(view.firstWeekday).fill(null), ...Array.from({ length: view.days }, (_, i) => i + 1)];

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-3 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-center justify-between px-1">
        <span className="text-[15px] font-bold">
          {view.year}년 {view.month}월
        </span>
        <div className="flex">
          <ReplaceLink href={view.prevHref} aria-label="이전 달" className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
            <ChevronLeft className="size-5" />
          </ReplaceLink>
          <ReplaceLink href={view.nextHref} aria-label="다음 달" className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
            <ChevronRight className="size-5" />
          </ReplaceLink>
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
          const lessons = view.lessons[day] ?? [];
          const inner = (
            <>
              <span>{day}</span>
              <Dot kind={lessons.length ? dotOf(lessons) : null} />
            </>
          );
          const className = cn(
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm text-foreground tabular-nums",
            view.today === day && "font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
          );
          if (lessons.length === 0) return <span key={day} className={className}>{inner}</span>;
          if (lessons.length === 1) {
            return (
              <Link key={day} href={`/lessons/${lessons[0].id}`} className={cn(className, "transition-colors hover:bg-accent")}>
                {inner}
              </Link>
            );
          }
          return (
            <button key={day} type="button" onClick={() => setPicking(day)} className={cn(className, "transition-colors hover:bg-accent")}>
              {inner}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Dot kind="fixed" />
          고정
        </span>
        <span className="flex items-center gap-1">
          <Dot kind="booked" />
          예약
        </span>
        <span className="flex items-center gap-1">
          <Dot kind="past" />
          지난 수업
        </span>
      </div>

      <BottomSheet open={picking !== null} onOpenChange={(o) => !o && setPicking(null)} title={picking ? `${view.month}/${picking} 수업` : ""}>
        <div className="flex flex-col gap-2">
          {(picking ? (view.lessons[picking] ?? []) : []).map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setPicking(null);
                startNav();
                router.push(`/lessons/${l.id}`);
              }}
              className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-left text-[15px] tabular-nums hover:bg-accent/50"
            >
              <span>{l.time}</span>
              <span className="text-xs font-bold text-primary">{l.past ? "지난 수업" : l.kind === "fixed" ? "고정" : "예약"}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </section>
  );
}
