import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth/session";
import { isMonthGenerated } from "@/lib/schedule/generate";
import { addMonths, dateKey, kstParts, monthKey, monthOf, parseMonthKey } from "@/lib/schedule/kst";
import { listMonthSlots } from "@/lib/schedule/teacher";
import { ScheduleCalendar, type CalendarSlot } from "./calendar";

export const metadata: Metadata = { title: "일정" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { db } = await requireTeacher();
  const now = new Date();
  const thisMonth = monthOf(now);
  const ym = parseMonthKey((await searchParams).month) ?? thisMonth;

  const [rows, generated] = await Promise.all([listMonthSlots(db, ym), isMonthGenerated(db, ym)]);
  const slots: CalendarSlot[] = rows.map((s) => {
    const start = kstParts(s.startsAt);
    return {
      id: s.id,
      date: dateKey(start.year, start.month, start.day),
      start: start.minute,
      // 24:00에 끝나면 다음 날 0분이 되므로 길이로 계산한다
      end: start.minute + Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
      weekly: s.weeklySlotId !== null,
      past: s.startsAt <= now,
      students: s.students.map((x) => ({ lessonId: x.lessonId, studentId: x.studentId, name: x.name, fixed: x.fixed, attendance: x.attendance })),
    };
  });

  const t = kstParts(now);
  const isFuture = ym.year * 12 + ym.month > thisMonth.year * 12 + thisMonth.month;
  return (
    <ScheduleCalendar
      key={monthKey(ym)}
      year={ym.year}
      month={ym.month}
      today={dateKey(t.year, t.month, t.day)}
      prevKey={monthKey(addMonths(ym, -1))}
      nextKey={monthKey(addMonths(ym, 1))}
      thisMonthKey={monthKey(thisMonth)}
      // 이번 달은 고정 시간 등록 때 바로 만들어지므로, 앞으로의 달에만 안내한다
      notGeneratedYet={isFuture && !generated}
      slots={slots}
    />
  );
}
