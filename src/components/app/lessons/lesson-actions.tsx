"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { cancelLessonAction } from "@/app/lesson-actions";
import { goBack } from "@/components/app/nav";
import { BottomSheet } from "./bottom-sheet";

const cta = "flex h-12 items-center justify-center rounded-xl border-[1.5px] text-[15px] font-bold transition-colors disabled:opacity-50";

// 예정 수업 화면 아래 버튼: 옮기기, 취소 (SCH-05). 취소는 확인창을 한 번 거친다
export function LessonButtons({ lessonId, label, fixed }: { lessonId: string; label: string; fixed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const cancel = () =>
    start(async () => {
      const res = await cancelLessonAction(lessonId);
      if (!res.ok) return void toast.error(res.error);
      setOpen(false);
      toast.success(`${label} 수업을 취소했어요`);
      goBack(router, "/");
    });

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <Link href={`/lessons/${lessonId}/move`} className={`${cta} border-primary text-primary hover:bg-accent/50`}>
        다른 시간으로 옮기기
      </Link>
      <button type="button" onClick={() => setOpen(true)} className={`${cta} border-red-200 text-red-700 hover:bg-red-50`}>
        이 수업 취소
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title={`${label} 수업을 취소할까요?`} description={fixed ? "이번 한 번만 취소돼요. 고정 일정은 그대로예요." : undefined}>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className={`${cta} flex-1 border-border text-foreground`}>
            그대로 둘게요
          </button>
          <button type="button" disabled={pending} onClick={cancel} className={`${cta} flex-1 border-red-600 bg-red-600 text-white`}>
            취소하기
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
