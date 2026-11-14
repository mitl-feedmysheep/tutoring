import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireTeacher } from "@/lib/auth/session";
import { scheduleHistory, studentProfile, teacherStudentCtx } from "@/lib/admin/student-schedule";
import { addMonths, clockText, dayLabel, monthKey, monthOf, parseMonthKey, slotText, weeklyText } from "@/lib/schedule/kst";
import { bookableSlots, upcomingLessons } from "@/lib/schedule/student";
import { shortWeeklyText, weeklyChoices } from "@/lib/schedule/weekly";
import { formatKst } from "@/lib/time";
import { lessonRecords } from "@/lib/lessons/attendance";
import { notesOf } from "@/lib/lessons/notes";
import { monthEntries, studySummary, toDbDate, type StudyEntry, type StudyOwner } from "@/lib/study/study";
import { paidDateText, paymentHistory } from "@/lib/payments/payments";
import { LessonRecords } from "./lesson-records";
import { PaymentRecords } from "./payment-records";
import { StudyRecords } from "./study-records";
import { StudentSchedule, type HistoryRow } from "./student-schedule";
import { DeactivateButton, OccupationField, ReactivateButton } from "./student-actions";

export const metadata: Metadata = { title: "학생 카드" };

const ACTION_LABEL = {
  lesson: { ADD: "수업 추가", CANCEL: "수업 취소", MOVE: "수업 옮김", CHANGE: "수업 변경", REMOVE: "수업 빼기" },
  weekly: { ADD: "고정 일정 추가", CANCEL: "고정 일정 취소", MOVE: "고정 일정 옮김", CHANGE: "고정 일정 변경", REMOVE: "고정 일정 빼기" },
} as const;

const BY_LABEL = { STUDENT: "학생", TEACHER: "선생님", SYSTEM: "자동" } as const;

const lessonLabel = (startsAt: Date, endsAt: Date) => `${slotText(startsAt)}–${clockText(endsAt)}`;

// 학생 카드 (ADMIN-01). 일정: 고정 일정·앞으로의 수업 바꾸기 (SCH-16), 일정 변경 이력 (SCH-17). 수업 이력과 참석·결석 체크 (LESSON-01, 02), 수업 노트 (NOTE-01~03), 공부 기록 (STUDY-06), 과외비 (PAY-03)
export default async function StudentCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ study?: string }> }) {
  const { id } = await params;
  const { db, teacherId } = await requireTeacher();
  const profile = await studentProfile(db, id);
  if (!profile) notFound();

  const now = new Date();
  const [records, payments] = await Promise.all([lessonRecords(db, profile.id, now), paymentHistory(db, profile.id, "next", now)]);
  const notes = await notesOf(db, records.lessons.map((l) => l.id));

  // 공부 기록: 이 학생 것만 (선생님 본인 기록은 student_id가 NULL이라 빠진다)
  const study: StudyOwner = { db, teacherId, studentId: profile.id };
  const thisMonth = monthOf(now);
  const asked = parseMonthKey((await searchParams).study);
  const studyMonth = asked && monthKey(asked) <= monthKey(thisMonth) ? asked : thisMonth;
  const [studyTotals, studyRows] = await Promise.all([studySummary(study, now), monthEntries(study, studyMonth)]);
  const studyDays = new Map<string, StudyEntry[]>();
  for (const e of studyRows) (studyDays.get(e.date) ?? studyDays.set(e.date, []).get(e.date)!).push(e);
  const studyHref = (ym: typeof thisMonth) => `/admin/students/${profile.id}?study=${monthKey(ym)}#study`;

  const meta = [profile.email, `${profile.birthYear}년생`, profile.gender === "MALE" ? "남성" : "여성"].join(" · ");
  const inactive = profile.deactivatedAt !== null;

  const header = (
    <div className="grid gap-1">
      <Link href="/admin/students" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        학생 목록
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {profile.name}
          {inactive && (
            <Badge variant="outline" className="ml-2 align-middle">
              비활성
            </Badge>
          )}
        </h2>
        {inactive ? <ReactivateButton studentId={profile.id} name={profile.name} /> : <DeactivateButton studentId={profile.id} name={profile.name} />}
      </div>
      <p className="text-sm text-muted-foreground">{meta}</p>
      {inactive ? (
        profile.occupation && <p className="text-sm">직업 {profile.occupation}</p>
      ) : (
        <OccupationField studentId={profile.id} occupation={profile.occupation} />
      )}
      {inactive && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {formatKst(profile.deactivatedAt!)}에 비활성화한 학생이에요. 로그인과 예약이 막혀 있고 기록만 볼 수 있어요.
        </p>
      )}
    </div>
  );

  const recordSections = (
    <>
      <LessonRecords
        studentName={profile.name}
        lessons={records.lessons.map((l) => ({
          id: l.id,
          label: lessonLabel(l.startsAt, l.endsAt),
          fixed: l.fixed,
          attendance: l.attendance,
          notes: notes.get(l.id) ?? { teacher: "", student: "" },
        }))}
        totals={records.totals}
      />
      <StudyRecords
        monthLabel={`${studyMonth.year}년 ${studyMonth.month}월`}
        prevHref={studyHref(addMonths(studyMonth, -1))}
        nextHref={monthKey(studyMonth) < monthKey(thisMonth) ? studyHref(addMonths(studyMonth, 1)) : null}
        summary={studyTotals}
        days={[...studyDays].map(([date, entries]) => ({ date, label: dayLabel(toDbDate(date)), entries }))}
      />
      <PaymentRecords
        studentId={profile.id}
        studentName={profile.name}
        readOnly={inactive}
        months={(payments ?? []).map((m) => ({ key: m.key, label: `${m.month.year}년 ${m.month.month}월`, paidText: m.paidAt && paidDateText(m.paidAt) }))}
      />
    </>
  );

  if (inactive) {
    return (
      <div className="grid grid-cols-1 gap-6">
        {header}
        {recordSections}
      </div>
    );
  }

  const ctx = await teacherStudentCtx(db, teacherId, profile.id);
  const [choices, upcoming, slots, history] = await Promise.all([weeklyChoices(ctx, now), upcomingLessons(ctx, now), bookableSlots(ctx, now), scheduleHistory(db, profile.id)]);

  const rows: HistoryRow[] = history.map((h) => ({
    id: h.id,
    at: formatKst(h.createdAt),
    by: BY_LABEL[h.changedBy],
    what: ACTION_LABEL[h.weeklyLessonId ? "weekly" : "lesson"][h.action],
    detail: h.beforeText && h.afterText ? `${h.beforeText} → ${h.afterText}` : (h.beforeText ?? h.afterText ?? ""),
    reason: h.reason,
  }));

  return (
    <div className="grid grid-cols-1 gap-6">
      {header}

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
      >
        {recordSections}
      </StudentSchedule>
    </div>
  );
}
