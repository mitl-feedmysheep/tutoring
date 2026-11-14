"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { saveMyNoteAction } from "@/app/lesson-actions";
import { useBullets } from "@/components/notes/use-bullets";
import { useNoteDraft } from "@/components/notes/use-note-draft";
import { cleanNote, NOTE_MAX } from "@/lib/lessons/note-text";

// 시안의 지난 수업 · 내 노트: 줄마다 "- " (APP-14), 아래 저장. 기한 없이 고칠 수 있다 (APP-10).
// 저장 전 내용은 기기에 임시 보관한다 (useNoteDraft)
export function NoteEditor({ lessonId, initial }: { lessonId: string; initial: string }) {
  const { value, setValue, props } = useBullets(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const changed = cleanNote(value) !== saved;
  const draft = useNoteDraft(`note-draft:${lessonId}`, value, saved, setValue);

  const save = () =>
    start(async () => {
      const text = cleanNote(value);
      const res = await saveMyNoteAction(lessonId, text);
      if (!res.ok) return void toast.error(res.error);
      draft.clear();
      setSaved(text);
      setValue(text);
      toast.success("노트를 저장했어요");
    });

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="my-note" className="px-1 text-sm font-bold">
        내 노트
      </label>
      <textarea
        id="my-note"
        {...props}
        maxLength={NOTE_MAX}
        rows={8}
        placeholder="오늘 배운 표현, 숙제를 적어요"
        // iOS는 16px보다 작은 글자 칸을 누르면 화면을 확대한다
        className="min-h-48 w-full resize-none rounded-xl bg-card px-4 py-3 text-base leading-relaxed shadow-[0_0_0_1px_var(--color-border)] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_2px_var(--color-primary)]"
      />
      <button
        type="button"
        disabled={!changed || pending}
        onClick={save}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors disabled:opacity-50"
      >
        {pending ? "저장하는 중..." : "저장"}
      </button>
    </div>
  );
}
