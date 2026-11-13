import { kstParts } from "@/lib/schedule/kst";

/** 수업 탭 인사 옆에 붙는 응원 문구 (APP-02) */
export const CHEERS = [
  "Keep it up!",
  "You got this!",
  "Step by step!",
  "Little by little!",
  "Keep going!",
  "Every day counts!",
  "Practice makes progress!",
  "Slow and steady!",
  "One day at a time!",
  "Small steps, big change!",
  "Stay consistent!",
  "You're getting there!",
] as const;

/** KST 날짜가 바뀔 때마다 다음 문구. 같은 날에는 몇 번을 열어도 같다 */
export function dailyCheer(now: Date = new Date()) {
  const { year, month, day } = kstParts(now);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return CHEERS[dayNumber % CHEERS.length];
}
