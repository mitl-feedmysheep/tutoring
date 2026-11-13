import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth/session";
import { groupSlots } from "@/lib/app/slot-groups";
import { ampmText, dayLabel } from "@/lib/schedule/kst";
import { bookableSlots, lessonDetail } from "@/lib/schedule/student";
import { SubScreen } from "@/components/app/screens";
import { Empty, Rule } from "@/components/app/ui";
import { SlotList } from "@/components/app/lessons/slot-list";

export const metadata: Metadata = { title: "시간 옮기기" };

const ID = /^[0-9a-f-]{36}$/;

// 다른 시간으로 옮기기 (SCH-05). 예약 화면과 같은 목록, 고르면 바로 옮겨진다
export default async function MovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const ctx = await requireStudent();
  const now = new Date();
  const lesson = await lessonDetail(ctx, id, now);
  if (!lesson) notFound();

  if (!lesson.canChange) {
    return (
      <SubScreen title="시간 옮기기" fallback="/">
        <Rule>{lesson.canceled ? "취소한 수업은 옮길 수 없어요." : "수업 시작 1시간 전이 지나서 옮길 수 없어요."}</Rule>
      </SubScreen>
    );
  }

  const slots = await bookableSlots(ctx, now);
  const groups = groupSlots(slots, lesson.slotId);
  const hasTarget = slots.some((s) => !s.mine);
  return (
    <SubScreen title="시간 옮기기" fallback="/">
      <Rule>
        지금: {dayLabel(lesson.startsAt)} {ampmText(lesson.startsAt)} → 옮길 시간을 골라요.
      </Rule>
      {hasTarget ? <SlotList groups={groups} moveFrom={lesson.id} /> : <Empty>옮길 수 있는 수업 시간이 아직 없어요</Empty>}
    </SubScreen>
  );
}
