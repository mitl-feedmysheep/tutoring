// 일정 계산용 KST 날짜 도구. 저장은 UTC, 규칙(요일·시각)은 KST 벽시계 기준 (NFR-06)
// 한국은 서머타임이 없어서 항상 UTC+9로 계산한다

const OFFSET_MS = 9 * 60 * 60_000;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type YearMonth = { year: number; month: number }; // month: 1~12

/** UTC 시각을 KST 날짜·요일·자정부터 분으로 */
export function kstParts(date: Date) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** KST 날짜 + 자정부터 분 → UTC 시각 */
export function kstToUtc(year: number, month: number, day: number, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, 0, minute) - OFFSET_MS);
}

export function daysInMonth({ year, month }: YearMonth) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths({ year, month }: YearMonth, n: number): YearMonth {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function monthOf(date: Date): YearMonth {
  const { year, month } = kstParts(date);
  return { year, month };
}

/** 그 달 KST 1일 00:00 ~ 다음 달 1일 00:00 (UTC) */
export function monthRange(ym: YearMonth) {
  const next = addMonths(ym, 1);
  return { start: kstToUtc(ym.year, ym.month, 1), end: kstToUtc(next.year, next.month, 1) };
}

/** DATE 컬럼에 넣는 그 달 1일 */
export function monthDate({ year, month }: YearMonth) {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** "2026-11" */
export function monthKey({ year, month }: YearMonth) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string | undefined): YearMonth | null {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

/** "2026-11-12" → KST 날짜 */
export function parseDateKey(key: string | undefined) {
  const m = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth({ year, month })) return null;
  return { year, month, day };
}

export function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isLastDayOfMonth(date: Date) {
  const p = kstParts(date);
  return p.day === daysInMonth(p);
}

/** 1140 → "19:00" */
export function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "19:00" → 1140. 24:00은 하루 끝으로 허용 */
export function parseTime(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || minute > 24 * 60) return null;
  return minute;
}

/** "매주 화 19:00~20:00" (일정 변경 이력용) */
export function weeklyText(w: { weekday: number; startMinute: number; endMinute: number }) {
  return `매주 ${WEEKDAYS[w.weekday]} ${formatMinute(w.startMinute)}~${formatMinute(w.endMinute)}`;
}

/** 그 달에서 고정 시간 요일에 해당하는 날의 시각들. after보다 늦게 시작하는 것만 */
export function weeklyOccurrences(w: { weekday: number; startMinute: number; endMinute: number }, ym: YearMonth, after: Date) {
  const out: { startsAt: Date; endsAt: Date }[] = [];
  for (let day = 1; day <= daysInMonth(ym); day++) {
    if (new Date(Date.UTC(ym.year, ym.month - 1, day)).getUTCDay() !== w.weekday) continue;
    const startsAt = kstToUtc(ym.year, ym.month, day, w.startMinute);
    if (startsAt <= after) continue;
    out.push({ startsAt, endsAt: kstToUtc(ym.year, ym.month, day, w.endMinute) });
  }
  return out;
}

/** "11/14 (토)" */
export function dayLabel(date: Date) {
  const p = kstParts(date);
  return `${p.month}/${String(p.day).padStart(2, "0")} (${WEEKDAYS[p.weekday]})`;
}

/** "19:00" (KST) */
export function clockText(date: Date) {
  return formatMinute(kstParts(date).minute);
}

/** "오후 7:00" (KST) */
export function ampmText(date: Date) {
  const m = kstParts(date).minute;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}:${String(m % 60).padStart(2, "0")}`;
}

/** "11/14(토) 10:00" (일정 변경 이력용) */
export function slotText(startsAt: Date) {
  return `${dayLabel(startsAt).replace(" ", "")} ${clockText(startsAt)}`;
}
