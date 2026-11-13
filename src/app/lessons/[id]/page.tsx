import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { timeRangeText } from "@/lib/app/lesson-format";
import { ampmText, dayLabel } from "@/lib/schedule/kst";
import { myNote } from "@/lib/lessons/notes";
import { lessonDetail } from "@/lib/schedule/student";
import { SubScreen } from "@/components/app/screens";
import { Card, Chip, Notice, Rule } from "@/components/app/ui";
import { AttendanceChip } from "@/components/app/lessons/attendance-chip";
import { LessonButtons } from "@/components/app/lessons/lesson-actions";
import { NoteEditor } from "@/components/app/lessons/note-editor";

export const metadata: Metadata = { title: "수업" };

const ID = /^[0-9a-f-]{36}$/;

// 수업 화면. 예정 수업은 옮기기·취소 (APP-13: 마감이 지나면 버튼 대신 안내). 시작한 수업은 내 노트 (NOTE-02, 05), 지난 수업은 출석도
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const ctx = await requireStudent();
  const lesson = await lessonDetail(ctx, id);
  if (!lesson) notFound();

  const label = `${dayLabel(lesson.startsAt)} ${ampmText(lesson.startsAt)}`;
  const started = lesson.startsAt <= new Date();
  const title = lesson.canceled ? "취소한 수업" : lesson.past ? "지난 수업" : started ? "진행 중인 수업" : "예정 수업";
  const note = started && !lesson.canceled ? await myNote(ctx, lesson.id) : null;

  return (
    <SubScreen title={title} fallback="/">
      <Card>
        <Kv label="날짜">{dayLabel(lesson.startsAt)}</Kv>
        <Kv label="시간">{timeRangeText(lesson.startsAt, lesson.endsAt)}</Kv>
        {!lesson.past && <Kv label="종류"><Chip>{lesson.fixed ? "고정" : "예약"}</Chip></Kv>}
        {!lesson.past && !lesson.canceled && <Kv label="참여">{lesson.participants}명</Kv>}
        {lesson.past && !lesson.canceled && <Kv label="출석"><AttendanceChip value={lesson.attendance} /></Kv>}
      </Card>

      {lesson.canceled ? (
        <>
          <Notice>취소했거나 다른 시간으로 옮긴 수업이에요.</Notice>
          <Link href="/lessons" className="text-center text-sm font-semibold text-primary">
            내 수업 보기
          </Link>
        </>
      ) : note !== null ? (
        <NoteEditor lessonId={lesson.id} initial={note} />
      ) : lesson.canChange ? (
        <>
          <Rule>
            수업 시작 1시간 전({dayLabel(lesson.deadline)} {ampmText(lesson.deadline)})까지 취소하거나 옮길 수 있어요.
          </Rule>
          <LessonButtons lessonId={lesson.id} label={label} fixed={lesson.fixed} />
        </>
      ) : (
        <Rule>수업 시작 1시간 전이 지나서 취소하거나 옮길 수 없어요. 꼭 바꿔야 하면 선생님께 말씀해 주세요.</Rule>
      )}
    </SubScreen>
  );
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[15px] tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <b className="font-semibold">{children}</b>
    </div>
  );
}
