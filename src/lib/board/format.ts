import { ampmText, kstParts } from "@/lib/schedule/kst";

// 게시판 시각 표시 (KST)

/** 목록: 오늘이면 "오후 7:00", 올해면 "11/14", 아니면 "2025. 11. 14." */
export function listTimeText(date: Date, now: Date) {
  const p = kstParts(date);
  const n = kstParts(now);
  if (p.year === n.year && p.month === n.month && p.day === n.day) return ampmText(date);
  if (p.year === n.year) return `${p.month}/${p.day}`;
  return `${p.year}. ${p.month}. ${p.day}.`;
}

/** 글·댓글: "11월 14일 오후 7:00", 올해가 아니면 연도도 */
export function fullTimeText(date: Date, now: Date) {
  const p = kstParts(date);
  const year = p.year === kstParts(now).year ? "" : `${p.year}년 `;
  return `${year}${p.month}월 ${p.day}일 ${ampmText(date)}`;
}

/** 댓글 옆: 오늘이면 "오후 7:00", 올해면 "11/14 오후 7:00", 아니면 연도도 */
export function commentTimeText(date: Date, now: Date) {
  const p = kstParts(date);
  const n = kstParts(now);
  if (p.year === n.year && p.month === n.month && p.day === n.day) return ampmText(date);
  const year = p.year === n.year ? "" : `${p.year}/`;
  return `${year}${p.month}/${p.day} ${ampmText(date)}`;
}
