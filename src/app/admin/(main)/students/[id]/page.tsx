import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { scheduleHistory, studentProfile, teacherStudentCtx } from "@/lib/admin/student-schedule";
import { clockText, slotText, weeklyText } from "@/lib/schedule/kst";
import { bookableSlots, upcomingLessons } from "@/lib/schedule/student";
import { shortWeeklyText, weeklyChoices } from "@/lib/schedule/weekly";
import { formatKst } from "@/lib/time";
import { StudentSchedule, type HistoryRow } from "./student-schedule";

export const metadata: Metadata = { title: "학생 카드" };

const ACTION_LABEL = {
  lesson: { ADD: "수업 추가", CANCEL: "수업 취소", MOVE: "수업 옮김", CHANGE: "수업 변경", REMOVE: "수업 빼기" },
  weekly: { ADD: "고정 일정 추가", CANCEL: "고정 일정 취소", MOVE: "고정 일정 옮김", CHANGE: "고정 일정 변경", REMOVE: "고정 일정 빼기" },
} as const;

const BY_LABEL = { STUDENT: "학생", TEACHER: "선생님", SYSTEM: "자동" } as const;

const lessonLabel = (startsAt: Date, endsAt: Date) => `${slotText(startsAt)}–${clockText(endsAt)}`;

// 학생 카드 (ADMIN-01). 지금은 일정: 고정 일정·앞으로의 수업 바꾸기 (SCH-16), 일정 변경 이력 (SCH-17)
export default async function StudentCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, teacherId } = await requireTeacher();
  const profile = await studentProfile(db, id);
  if (!profile) notFound();

  const now = new Date();
  const ctx = await teacherStudentCtx(db, teacherId, profile.id);
  const [choices, upcoming, slots, history] = await Promise.all([
    weeklyChoices(ctx, now),
    upcomingLessons(ctx, now),
    bookableSlots(ctx, now),
    scheduleHistory(db, profile.id),
  ]);

  const rows: HistoryRow[] = history.map((h) => ({
    id: h.id,
    at: formatKst(h.createdAt),
    by: BY_LABEL[h.changedBy],
    what: ACTION_LABEL[h.weeklyLessonId ? "weekly" : "lesson"][h.action],
    detail: h.beforeText && h.afterText ? `${h.beforeText} → ${h.afterText}` : (h.beforeText ?? h.afterText ?? ""),
    reason: h.reason,
  }));

  const meta = [profile.email, `${profile.birthYear}년생`, profile.gender === "MALE" ? "남성" : "여성", profile.occupation].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-1">
        <Link href="/admin/students" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          학생 목록
        </Link>
        <h2 className="text-lg font-semibold">{profile.name}</h2>
        <p className="text-sm text-muted-foreground">{meta}</p>
      </div>

      <StudentSchedule
        studentId={profile.id}
        studentName={profile.name}
        weekly={choices.filter((c) => c.mine).map((c) => ({ id: c.id, label: weeklyText(c), note: c.ending ? `${c.ending.month}월부터 없어져요 (닫은 시간)` : null }))}
        choices={choices.map((c) => ({
          id: c.id,
          label: weeklyText(c),
          mine: c.mine,
          closed: c.ending !== null,
          note: c.ending ? `${c.ending.month}월부터 없어져요` : c.changing ? `${c.changing.from.month}월부터 이 시간 (지금은 ${shortWeeklyText(c.changing.old)})` : null,
        }))}
        lessons={upcoming.map((l) => ({ id: l.id, slotId: l.slotId, label: lessonLabel(l.startsAt, l.endsAt), fixed: l.fixed, started: l.startsAt <= now }))}
        slots={slots.map((s) => ({ id: s.id, label: lessonLabel(s.startsAt, s.endsAt), participants: s.participants, mine: s.mine !== null }))}
        history={rows}
      />
    </div>
  );
}
