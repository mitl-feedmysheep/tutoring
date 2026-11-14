import type { ScopedDb } from "@/lib/db/scope";
import { addMonths, dateKey, daysInMonth, monthDate, monthRange, type YearMonth } from "@/lib/schedule/kst";
import { fromDbDate, todayKey, toDbDate } from "./study";

// 어드민 공부 기록 (STUDY-10): 활성 학생마다 그 달 날짜별 공부 여부, 연속 공부 일수, 마지막 기록.
// 선생님 범위(teacherDb)로만 읽는다. 선생님 본인 기록(student_id NULL)은 넣지 않는다

const DAY_MS = 24 * 60 * 60_000;
const addDays = (key: string, n: number) => fromDbDate(new Date(toDbDate(key).getTime() + n * DAY_MS));
const daysBetween = (a: string, b: string) => Math.round((toDbDate(b).getTime() - toDbDate(a).getTime()) / DAY_MS);

export type StudyOverviewRow = {
  id: string;
  name: string;
  /** 그 달 날짜별 공부 시간(분). 0 = 안 함, null = 셀 날이 아님(가입 전, 아직 안 온 날) */
  days: (number | null)[];
  monthMinutes: number;
  studiedDays: number;
  /** 분모: 그 달에서 가입한 날부터 오늘까지 지난 날 수 */
  countedDays: number;
  /** 오늘 기준 연속 공부 일수. 오늘 아직 안 했으면 어제까지 이어진 것을 센다 */
  streak: number;
  /** 마지막으로 공부한 날 (KST), 없으면 null */
  lastDate: string | null;
};

export async function studyOverview(db: ScopedDb, ym: YearMonth, now = new Date()): Promise<StudyOverviewRow[]> {
  const students = await db.student.findMany({
    where: { deactivatedAt: null, createdAt: { lt: monthRange(ym).end } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });
  if (students.length === 0) return [];

  const today = todayKey(now);
  const groups = await db.studyLog.groupBy({
    by: ["studentId", "studyDate"],
    where: { studentId: { in: students.map((s) => s.id) }, studyDate: { lte: toDbDate(today) } },
    _sum: { minutes: true },
  });
  const byStudent = new Map<string, Map<string, number>>();
  for (const g of groups) {
    if (!g.studentId) continue;
    const m = byStudent.get(g.studentId) ?? byStudent.set(g.studentId, new Map()).get(g.studentId)!;
    m.set(fromDbDate(g.studyDate), g._sum.minutes ?? 0);
  }

  const monthStart = fromDbDate(monthDate(ym));
  const monthEnd = addDays(fromDbDate(monthDate(addMonths(ym, 1))), -1);

  return students.map((s) => {
    const mins = byStudent.get(s.id) ?? new Map<string, number>();
    const studied = [...mins].filter(([, m]) => m > 0).map(([d]) => d).sort();
    // 학생 카드 합계(STUDY-04)와 같이, 가입 전날 "어제" 기록이 있으면 그날부터 센다
    const signup = todayKey(s.createdAt);
    const since = studied[0] && studied[0] < signup ? studied[0] : signup;

    const days: (number | null)[] = [];
    for (let d = 1; d <= daysInMonth(ym); d++) {
      const key = dateKey(ym.year, ym.month, d);
      days.push(key < since || key > today ? null : (mins.get(key) ?? 0));
    }

    const lastDate = studied.at(-1) ?? null;
    let streak = 0;
    if (lastDate && lastDate >= addDays(today, -1)) {
      const set = new Set(studied);
      for (let d = lastDate; set.has(d); d = addDays(d, -1)) streak++;
    }

    const from = since > monthStart ? since : monthStart;
    const to = today < monthEnd ? today : monthEnd;
    return {
      id: s.id,
      name: s.name,
      days,
      monthMinutes: days.reduce<number>((sum, m) => sum + (m ?? 0), 0),
      studiedDays: days.filter((m) => m !== null && m > 0).length,
      countedDays: from > to ? 0 : daysBetween(from, to) + 1,
      streak,
      lastDate,
    };
  });
}

/** 마지막 기록이 오늘에서 며칠 전인지 (오늘 = 0) */
export const daysAgo = (date: string, now = new Date()) => daysBetween(date, todayKey(now));
