import { ampmText, kstParts, kstToUtc, WEEKDAYS } from "@/lib/schedule/kst";

// 수업 화면 표시용 (KST)

/** "오후 7:00 – 7:50". 끝 시각이 오전/오후가 같으면 줄인다 */
export function timeRangeText(startsAt: Date, endsAt: Date) {
  const start = ampmText(startsAt);
  const end = ampmText(endsAt);
  return `${start} – ${start.slice(0, 2) === end.slice(0, 2) ? end.slice(3) : end}`;
}

/** 같은 KST 날짜인지 */
export function sameKstDay(a: Date, b: Date) {
  const x = kstParts(a);
  const y = kstParts(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/** 다음 수업 카드: "오늘 (11/12 목)", "내일 (11/13 금)", "11/14 (토)" */
export function nextDayText(startsAt: Date, now: Date) {
  const p = kstParts(startsAt);
  const md = `${p.month}/${p.day}`;
  const n = kstParts(now);
  const tomorrow = new Date(kstToUtc(n.year, n.month, n.day).getTime() + 24 * 60 * 60_000);
  if (sameKstDay(startsAt, now)) return `오늘 (${md} ${WEEKDAYS[p.weekday]})`;
  if (sameKstDay(startsAt, tomorrow)) return `내일 (${md} ${WEEKDAYS[p.weekday]})`;
  return `${md} (${WEEKDAYS[p.weekday]})`;
}
