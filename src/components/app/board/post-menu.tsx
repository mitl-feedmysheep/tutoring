"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { deletePostAction } from "@/app/board-actions";
import { goBack } from "@/components/app/nav";
import { BottomSheet } from "@/components/app/lessons/bottom-sheet";

const cta = "flex h-12 items-center justify-center rounded-xl border-[1.5px] text-[15px] font-bold transition-colors disabled:opacity-50";

// 내가 쓴 글의 고치기·지우기 (APP-11). 지우기는 확인창을 한 번 거친다. back: 지운 뒤 돌아갈 목록
export function PostMenu({ postId, back }: { postId: string; back: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      const res = await deletePostAction(postId);
      if (!res.ok) return void toast.error(res.error);
      setOpen(false);
      toast.success("글을 지웠어요");
      goBack(router, back);
    });

  return (
    <div className="flex gap-3 text-xs font-semibold text-muted-foreground">
      <Link href={`/board/${postId}/edit`} className="hover:text-foreground">
        고치기
      </Link>
      <button type="button" onClick={() => setOpen(true)} className="hover:text-red-700">
        지우기
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title="글을 지울까요?" description="달린 댓글도 함께 사라져요.">
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className={`${cta} flex-1 border-border text-foreground`}>
            그대로 둘게요
          </button>
          <button type="button" disabled={pending} onClick={remove} className={`${cta} flex-1 border-red-600 bg-red-600 text-white`}>
            지우기
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
