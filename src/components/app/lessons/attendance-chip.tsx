import type { MyLesson } from "@/lib/schedule/student";
import { Chip } from "@/components/app/ui";

/** 지난 수업 출석: 참석 / 결석 / 체크 전 */
export function AttendanceChip({ value }: { value: MyLesson["attendance"] }) {
  if (value === "COMPLETED") return <Chip>참석</Chip>;
  if (value === "ABSENT") return <Chip tone="warn">결석</Chip>;
  return <Chip tone="gray">체크 전</Chip>;
}
