import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { studentDb } from "@/lib/db/scope";
import { dailyCheer } from "@/lib/app/cheer";
import { nextDayText, timeRangeText } from "@/lib/app/lesson-format";
import { addMonths, clockText, daysInMonth, kstParts, monthKey, monthOf, parseMonthKey } from "@/lib/schedule/kst";
import { monthLessons, nextLesson, type StudentCtx } from "@/lib/schedule/student";
import { TabScreen } from "@/components/app/screens";
import { NextLessonCard, type NextLessonView } from "@/components/app/lessons/next-lesson-card";
import { LessonCalendar, type CalendarLesson, type CalendarView } from "@/components/app/lessons/lesson-calendar";

// 수업 탭. 앱을 열면 첫 화면 (APP-01, APP-02). 선생님·학생 공용
export default async function LessonTab({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const account = await requireUser();
  const { claims } = account;
  const isTeacher = claims.role === "teacher";
  const title = <span className="text-[15px]">{`${account.name}${isTeacher ? " 선생님" : "님"}, ${dailyCheer()}`}</span>;

  if (claims.role !== "student") {
    return (
      <TabScreen title={title}>
        <Placeholder>오늘·이번 주 수업 목록이 여기에 나와요.</Placeholder>
      </TabScreen>
    );
  }

  const ctx: StudentCtx = { db: studentDb(claims.teacherId, claims.studentId), teacherId: claims.teacherId, studentId: claims.studentId };
  const now = new Date();
  const ym = parseMonthKey((await searchParams).month) ?? monthOf(now);
  const [next, lessons] = await Promise.all([nextLesson(ctx, now), monthLessons(ctx, ym)]);

  const nextView: NextLessonView | null = next && {
    id: next.id,
    startsAt: next.startsAt.toISOString(),
    endsAt: next.endsAt.toISOString(),
    dayText: nextDayText(next.startsAt, now),
    timeText: timeRangeText(next.startsAt, next.endsAt),
    kindText: `${next.fixed ? "고정" : "예약"} 수업 · ${next.participants}명 참여`,
  };

  const byDay: Record<number, CalendarLesson[]> = {};
  for (const l of lessons) {
    const day = kstParts(l.startsAt).day;
    (byDay[day] ??= []).push({ id: l.id, time: clockText(l.startsAt), kind: l.fixed ? "fixed" : "booked", past: l.endsAt <= now });
  }
  const today = kstParts(now);
  const calendar: CalendarView = {
    ...ym,
    firstWeekday: new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay(),
    days: daysInMonth(ym),
    today: today.year === ym.year && today.month === ym.month ? today.day : null,
    lessons: byDay,
    prevHref: `/?month=${monthKey(addMonths(ym, -1))}`,
    nextHref: `/?month=${monthKey(addMonths(ym, 1))}`,
  };

  return (
    <TabScreen
      title={title}
      action={
        <Link href="/book" className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-sm font-bold text-primary">
          + 예약
        </Link>
      }
    >
      <NextLessonCard lesson={nextView} />
      <div className="-mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold">{ym.month === today.month && ym.year === today.year ? "이번 달 수업" : `${ym.month}월 수업`}</h2>
        <Link href="/lessons" className="text-sm text-muted-foreground hover:text-foreground">
          전체 보기
        </Link>
      </div>
      <LessonCalendar view={calendar} />
    </TabScreen>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
