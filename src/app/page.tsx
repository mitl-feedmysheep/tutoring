import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { studentDb, teacherDb } from "@/lib/db/scope";
import { dailyCheer } from "@/lib/app/cheer";
import { nextDayText, timeRangeText } from "@/lib/app/lesson-format";
import { lessonNeedingNote } from "@/lib/lessons/notes";
import { addMonths, clockText, dayLabel, daysInMonth, kstParts, monthKey, monthOf, parseMonthKey, type YearMonth } from "@/lib/schedule/kst";
import { monthLessons, nextLesson, type StudentCtx } from "@/lib/schedule/student";
import { listMonthSlots } from "@/lib/schedule/teacher";
import { nextTeacherSlot } from "@/lib/meeting/meeting";
import { vapidPublicKey } from "@/lib/push/push";
import { TabScreen } from "@/components/app/screens";
import { NotificationPrompt } from "@/components/app/notification-prompt";
import { NextLessonCard, type NextLessonView } from "@/components/app/lessons/next-lesson-card";
import { NoteReminderCard } from "@/components/app/lessons/note-reminder-card";
import { LessonCalendar, type CalendarLesson, type CalendarView } from "@/components/app/lessons/lesson-calendar";

// 수업 탭. 앱을 열면 첫 화면 (APP-01, APP-02). 선생님·학생 공용
export default async function LessonTab({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const account = await requireUser();
  const { claims } = account;
  const isTeacher = claims.role === "teacher";
  const title = <span className="text-[15px]">{`${account.name}${isTeacher ? " 선생님" : "님"}, ${dailyCheer()}`}</span>;
  const now = new Date();
  const ym = parseMonthKey((await searchParams).month) ?? monthOf(now);
  const today = kstParts(now);
  const monthTitle = (
    <div className="-mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-bold">{ym.month === today.month && ym.year === today.year ? "이번 달 수업" : `${ym.month}월 수업`}</h2>
      {!isTeacher && (
        <Link href="/lessons" className="text-sm text-muted-foreground hover:text-foreground">
          전체 보기
        </Link>
      )}
    </div>
  );

  if (claims.role !== "student") {
    // 선생님: 학생이 있는 다음 수업 카드에서 입장 (MEET-04), 아래는 학생과 같은 이번 달 달력 (APP-05)
    const [slot, slots] = await Promise.all([nextTeacherSlot(claims.teacherId, now), listMonthSlots(teacherDb(claims.teacherId), ym)]);
    const slotView: NextLessonView | null = slot && {
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      dayText: nextDayText(slot.startsAt, now),
      timeText: timeRangeText(slot.startsAt, slot.endsAt),
      kindText: `${slot.names.join(", ")} · ${slot.names.length}명`,
    };
    return (
      <TabScreen title={title}>
        <NextLessonCard lesson={slotView} emptyAction={false} />
        {monthTitle}
        <LessonCalendar
          view={calendarView(
            ym,
            now,
            // 학생이 있는 슬롯만 수업으로 친다. 고정 학생이 한 명이라도 있으면 고정
            slots
              .filter((s) => s.students.length > 0)
              .map((s) => ({
                id: s.id,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                fixed: s.students.some((x) => x.fixed),
                names: s.students.map((x) => x.name).join(", "),
              })),
          )}
        />
        <NotificationPrompt publicKey={vapidPublicKey()} />
      </TabScreen>
    );
  }

  const ctx: StudentCtx = { db: studentDb(claims.teacherId, claims.studentId), teacherId: claims.teacherId, studentId: claims.studentId };
  const [next, lessons, noteLesson] = await Promise.all([nextLesson(ctx, now), monthLessons(ctx, ym), lessonNeedingNote(ctx, now)]);

  const nextView: NextLessonView | null = next && {
    id: next.id,
    href: `/lessons/${next.id}`,
    startsAt: next.startsAt.toISOString(),
    endsAt: next.endsAt.toISOString(),
    dayText: nextDayText(next.startsAt, now),
    timeText: timeRangeText(next.startsAt, next.endsAt),
    kindText: `${next.fixed ? "고정" : "예약"} 수업 · ${next.participants}명 참여`,
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
      {noteLesson && <NoteReminderCard href={`/lessons/${noteLesson.id}`} label={`${dayLabel(noteLesson.startsAt)} ${clockText(noteLesson.startsAt)}`} />}
      {monthTitle}
      <LessonCalendar view={calendarView(ym, now, lessons.map((l) => ({ ...l, href: `/lessons/${l.id}` })))} />
      <NotificationPrompt publicKey={vapidPublicKey()} />
    </TabScreen>
  );
}

type MonthLesson = { id: string; startsAt: Date; endsAt: Date; fixed: boolean; href?: string; names?: string };

function calendarView(ym: YearMonth, now: Date, lessons: MonthLesson[]): CalendarView {
  const byDay: Record<number, CalendarLesson[]> = {};
  for (const l of lessons) {
    const day = kstParts(l.startsAt).day;
    (byDay[day] ??= []).push({ id: l.id, time: clockText(l.startsAt), kind: l.fixed ? "fixed" : "booked", past: l.endsAt <= now, href: l.href, names: l.names });
  }
  const today = kstParts(now);
  return {
    ...ym,
    firstWeekday: new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay(),
    days: daysInMonth(ym),
    today: today.year === ym.year && today.month === ym.month ? today.day : null,
    lessons: byDay,
    prevHref: `/?month=${monthKey(addMonths(ym, -1))}`,
    nextHref: `/?month=${monthKey(addMonths(ym, 1))}`,
  };
}
