"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { addCommentAction, deleteCommentAction } from "@/app/board-actions";
import { BottomSheet } from "@/components/app/lessons/bottom-sheet";
import { cleanText, COMMENT_MAX } from "@/lib/board/rules";

export type CommentItem = {
  id: string;
  mine: boolean;
  content: string;
  time: string;
};

const cta = "flex h-12 items-center justify-center rounded-xl border-[1.5px] text-[15px] font-bold transition-colors disabled:opacity-50";

/**
 * 댓글을 대화처럼 보여 준다 (APP-15). 내 댓글은 오른쪽, 상대방 댓글은 왼쪽.
 * 내 댓글을 누르면 지울지 묻는다. 아래에 댓글 쓰는 칸을 붙여 둔다
 */
export function Comments({ postId, comments, otherName }: { postId: string; comments: CommentItem[]; otherName: string }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(comments.length);

  // 새 댓글이 붙으면 맨 아래로 (처음 열 때는 글부터 보이게 그대로 둔다)
  useEffect(() => {
    if (comments.length > count.current) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    count.current = comments.length;
  }, [comments.length]);

  const remove = () =>
    start(async () => {
      if (!deleting) return;
      const res = await deleteCommentAction(deleting);
      if (!res.ok) return void toast.error(res.error);
      setDeleting(null);
      toast.success("댓글을 지웠어요");
    });

  return (
    <>
      <section aria-label="댓글" className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-bold">
          댓글 <span className="text-primary tabular-nums">{comments.length}</span>
        </h2>
        {comments.length === 0 && <p className="px-1 text-sm text-muted-foreground">아직 댓글이 없어요.</p>}
        {comments.map((c) =>
          c.mine ? (
            <div key={c.id} className="flex items-end justify-end gap-1.5">
              <time className="shrink-0 text-[11px] text-muted-foreground">{c.time}</time>
              <button
                type="button"
                onClick={() => setDeleting(c.id)}
                className="max-w-[78%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-left text-[15px] leading-relaxed whitespace-pre-wrap break-words text-primary-foreground"
              >
                {c.content}
              </button>
            </div>
          ) : (
            <div key={c.id} className="flex flex-col items-start gap-1">
              <span className="px-1 text-xs font-semibold text-muted-foreground">{otherName}</span>
              <div className="flex max-w-full items-end gap-1.5">
                <p className="max-w-[78%] rounded-2xl rounded-bl-md bg-card px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words shadow-[0_0_0_1px_var(--color-border)]">
                  {c.content}
                </p>
                <time className="shrink-0 text-[11px] text-muted-foreground">{c.time}</time>
              </div>
            </div>
          ),
        )}
        <div ref={end} />
      </section>

      <CommentInput postId={postId} />

      <BottomSheet open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title="댓글을 지울까요?">
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeleting(null)} className={`${cta} flex-1 border-border text-foreground`}>
            그대로 둘게요
          </button>
          <button type="button" disabled={pending} onClick={remove} className={`${cta} flex-1 border-red-600 bg-red-600 text-white`}>
            지우기
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

/** 화면 맨 아래에 고정된 댓글 칸. 글이 길면 4줄까지 늘어난다 */
function CommentInput({ postId }: { postId: string }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = cleanText(value) !== "";

  // 내용에 맞춰 높이를 맞춘다 (최대 높이는 CSS)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const send = () =>
    start(async () => {
      const res = await addCommentAction(postId, value);
      if (!res.ok) return void toast.error(res.error);
      setValue("");
    });

  return (
    <>
      {/* 아래 칸에 마지막 댓글이 가리지 않게 자리를 둔다 */}
      <div aria-hidden className="h-16" />
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-border bg-background/95 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md">
        <div className="flex items-end gap-2">
          <textarea
            ref={ref}
            aria-label="댓글"
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={COMMENT_MAX}
            placeholder="댓글을 적어요"
            // iOS는 16px보다 작은 글자 칸을 누르면 화면을 확대한다
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl bg-card px-4 py-2.5 text-base leading-normal shadow-[0_0_0_1px_var(--color-border)] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_2px_var(--color-primary)]"
          />
          <button
            type="button"
            aria-label="보내기"
            disabled={!ready || pending}
            onClick={send}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-5" />
          </button>
        </div>
      </div>
    </>
  );
}
