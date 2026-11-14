"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { createPostAction, updatePostAction } from "@/app/board-actions";
import { goBack, replaceTo } from "@/components/app/nav";
import { cleanText, CONTENT_MAX, TITLE_MAX } from "@/lib/board/rules";

const field =
  // iOS는 16px보다 작은 글자 칸을 누르면 화면을 확대한다
  "w-full rounded-xl bg-card px-4 py-3 text-base shadow-[0_0_0_1px_var(--color-border)] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_2px_var(--color-primary)]";

/**
 * 글 쓰기·고치기 (BOARD-04, APP-11).
 * 새 글: 저장하면 쓰기 화면을 글 화면으로 바꾼다 (← 가 쓰기 화면으로 돌아오지 않게).
 * 고치기: 저장하면 글 화면으로 돌아간다
 */
export function PostForm({ mode, studentId, post }: { mode: "new"; studentId: string | null; post?: undefined } | { mode: "edit"; studentId?: undefined; post: { id: string; title: string; content: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [pending, start] = useTransition();
  const ready = cleanText(title) !== "" && cleanText(content) !== "";
  const changed = !post || cleanText(title) !== post.title || cleanText(content) !== post.content;

  const save = () =>
    start(async () => {
      const input = { title, content };
      if (mode === "new") {
        const res = await createPostAction(studentId, input);
        if (!res.ok) return void toast.error(res.error);
        toast.success("글을 올렸어요");
        replaceTo(router, `/board/${res.id}`);
      } else {
        const res = await updatePostAction(post.id, input);
        if (!res.ok) return void toast.error(res.error);
        toast.success("글을 고쳤어요");
        goBack(router, `/board/${post.id}`);
      }
    });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input aria-label="제목" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="제목" className={`${field} font-semibold`} />
      <textarea
        aria-label="내용"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={CONTENT_MAX}
        rows={12}
        placeholder="질문이나 수업 후기를 적어요"
        className={`${field} min-h-64 resize-none leading-relaxed`}
      />
      <button
        type="submit"
        disabled={!ready || !changed || pending}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors disabled:opacity-50"
      >
        {pending ? "저장하는 중..." : mode === "new" ? "올리기" : "저장"}
      </button>
    </form>
  );
}
