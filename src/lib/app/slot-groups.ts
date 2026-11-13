import { clockText, dayLabel } from "@/lib/schedule/kst";
import type { BookableSlot } from "@/lib/schedule/student";
import type { SlotGroup } from "@/components/app/lessons/slot-list";

/** 예약·옮기기 목록을 날짜별로 묶는다. currentSlotId = 옮기기에서 지금 수업의 시간 */
export function groupSlots(slots: BookableSlot[], currentSlotId?: string): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const s of slots) {
    const title = dayLabel(s.startsAt);
    const view = {
      id: s.id,
      time: clockText(s.startsAt),
      label: `${title} ${clockText(s.startsAt)}`,
      participants: s.participants,
      mine: s.mine ? (s.mine.fixed ? "fixed" : "booked") : null,
      current: s.id === currentSlotId,
    } as const;
    const last = groups[groups.length - 1];
    if (last?.title === title) last.slots.push(view);
    else groups.push({ title, slots: [view] });
  }
  return groups;
}
