import { listTeacherIds } from "@/lib/db/teachers";
import { teacherDb, type ScopedDb } from "@/lib/db/scope";
import { generateMonth, isMonthGenerated } from "./generate";
import { addMonths, isLastDayOfMonth, monthOf } from "./kst";

/**
 * 선생님 한 명의 월말 슬롯 생성 (SCH-11)
 * - KST 마지막 날이면 다음 달을 만든다
 * - 마지막 날에 서버가 꺼져 있어서 놓쳤으면, 다음 달 초에 이번 달을 만든다 (지난 달은 만들었는데 이번 달 기록이 없을 때)
 * 이미 만든 달은 건너뛰므로 여러 번 불러도 된다
 */
export async function runMonthlyGenerationFor(db: ScopedDb, now: Date) {
  const cur = monthOf(now);
  if (isLastDayOfMonth(now)) return generateMonth(db, addMonths(cur, 1), now);
  if (!(await isMonthGenerated(db, cur)) && (await isMonthGenerated(db, addMonths(cur, -1)))) return generateMonth(db, cur, now);
  return null;
}

/** 스케줄러가 부른다. 모든 선생님을 각자의 범위에서 처리한다 */
export async function runMonthlyGeneration(now = new Date()) {
  const results: { teacherId: string; ok: boolean }[] = [];
  for (const teacherId of await listTeacherIds()) {
    try {
      await runMonthlyGenerationFor(teacherDb(teacherId), now);
      results.push({ teacherId, ok: true });
    } catch (e) {
      // 한 선생님이 실패해도 다른 선생님은 계속 만든다
      console.error(`[schedule] 월 생성 실패 teacher=${teacherId}`, e);
      results.push({ teacherId, ok: false });
    }
  }
  return results;
}
