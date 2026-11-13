import { Badge } from "@/components/ui/badge";
import { AttendanceToggle } from "@/components/admin/attendance-toggle";
import { LessonNoteRow } from "./lesson-note";

type Record = { id: string; label: string; fixed: boolean; attendance: "COMPLETED" | "ABSENT" | null; notes: { teacher: string; student: string } };
type Totals = { completed: number; absent: number; unchecked: number };

// 학생 카드의 수업 이력 (LESSON-02). 시작한 수업마다 완료·결석 체크 (LESSON-01)와 노트 (NOTE-01~03)
export function LessonRecords({ studentName, lessons, totals }: { studentName: string; lessons: Record[]; totals: Totals }) {
  return (
    <section className="grid gap-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">수업 이력</h3>
        <p className="text-sm text-muted-foreground tabular-nums">
          완료 {totals.completed} · 결석 {totals.absent}
          {totals.unchecked > 0 && <span className="font-medium text-amber-700"> · 체크 전 {totals.unchecked}</span>}
        </p>
      </div>
      {lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 지난 수업이 없어요.</p>
      ) : (
        <ul className="grid divide-y">
          {lessons.map((l) => (
            <LessonNoteRow
              key={l.id}
              lessonId={l.id}
              label={l.label}
              studentName={studentName}
              teacher={l.notes.teacher}
              student={l.notes.student}
              actions={<AttendanceToggle lessonId={l.id} value={l.attendance} />}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums">{l.label}</span>
                <Badge variant="outline" className={l.fixed ? "border-emerald-200 text-emerald-800" : "border-amber-200 text-amber-800"}>
                  {l.fixed ? "고정" : "예약"}
                </Badge>
              </div>
            </LessonNoteRow>
          ))}
        </ul>
      )}
    </section>
  );
}
