"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bookSlotAction, moveLessonAction } from "@/app/lesson-actions";
import { goBackSteps } from "@/components/app/nav";
import { Card, Chip, GroupTitle, Row } from "@/components/app/ui";

export type SlotView = {
  id: string;
  time: string;
  label: string;
  participants: number;
  /** 이미 내 수업이 있는 시간 */
  mine: "fixed" | "booked" | null;
  /** 옮기기: 지금 수업의 시간 */
  current?: boolean;
};

export type SlotGroup = { title: string; slots: SlotView[] };

/** 예약 화면과 시간 옮기기 화면이 같이 쓰는 목록. moveFrom이 있으면 옮기기 */
export function SlotList({ groups, moveFrom }: { groups: SlotGroup[]; moveFrom?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const pick = (slot: SlotView) =>
    start(async () => {
      if (moveFrom) {
        const res = await moveLessonAction(moveFrom, slot.id);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${slot.label} 수업으로 옮겼어요`);
        // 수업 화면과 옮기기 화면을 건너뛰고 처음 들어온 화면(달력·목록)으로. 바로 들어왔으면 새 수업 화면
        goBackSteps(router, 2, `/lessons/${res.lessonId}`);
      } else {
        const res = await bookSlotAction(slot.id);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${slot.label} 수업을 예약했어요`);
      }
    });

  return groups.map((g) => (
    <div key={g.title} className="flex flex-col gap-4">
      <GroupTitle>{g.title}</GroupTitle>
      <Card>
        {g.slots.map((s) => (
          <Row key={s.id}>
            <span>
              {s.time}
              <small className="ml-2 text-[13px] text-muted-foreground">{s.participants ? `${s.participants}명 참여 예정` : "아직 없음"}</small>
            </span>
            {s.current ? (
              <Chip tone="gray">지금 시간</Chip>
            ) : s.mine ? (
              <Chip>{s.mine === "fixed" ? "고정" : "예약함"}</Chip>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(s)}
                className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {moveFrom ? "여기로" : "예약"}
              </button>
            )}
          </Row>
        ))}
      </Card>
    </div>
  ));
}
