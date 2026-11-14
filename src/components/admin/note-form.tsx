"use client";

import { useState, useTransition } from "react";
import { askConfirm } from "@/components/confirm-dialog";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FormError } from "@/components/auth/auth-card";
import { useBullets } from "@/components/notes/use-bullets";
import { discardNoteDraft, useNoteDraft } from "@/components/notes/use-note-draft";
import { saveTeacherNoteAction } from "@/app/admin/lesson-record-actions";
import { cleanNote, NOTE_MAX } from "@/lib/lessons/note-text";

// 선생님 노트 쓰기 창 (NOTE-01). 학생 카드 수업 이력과 일정 화면이 같이 쓴다. 창(Sheet) 안에 넣는다

const draftKey = (lessonId: string) => `note-draft:teacher:${lessonId}`;

export type NoteFormProps = { lessonId: string; label: string; studentName: string; teacher: string; student: string };

/** 창 열기·닫기. 저장 안 한 내용이 있으면 닫기 전에 묻는다 (수업 중에 쓴 노트를 실수로 잃지 않게) */
export function useNoteSheet(lessonId: string) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const close = async (next: boolean) => {
    if (next) return setOpen(true);
    if (dirty) {
      if (!(await askConfirm({ title: "저장하지 않은 노트가 있어요. 닫을까요?", description: "닫으면 쓴 내용이 사라져요.", confirmLabel: "닫기", cancelLabel: "계속 쓸게요", destructive: true }))) return;
      discardNoteDraft(draftKey(lessonId));
    }
    setDirty(false);
    setOpen(false);
  };
  const done = () => (setDirty(false), setOpen(false));
  return { open, setOpen, setDirty, close, done };
}

export function NoteForm({
  lessonId,
  label,
  studentName,
  teacher,
  student,
  onDirty,
  onDone,
  onCancel,
}: NoteFormProps & { onDirty: (v: boolean) => void; onDone: () => void; onCancel: () => void }) {
  const { value, setValue, props } = useBullets(teacher);
  const draft = useNoteDraft(draftKey(lessonId), value, teacher, (d) => (setValue(d), onDirty(true)));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onChange(e);
    onDirty(cleanNote(e.currentTarget.value) !== teacher);
  };

  const save = () =>
    start(async () => {
      const res = await saveTeacherNoteAction(lessonId, cleanNote(value));
      if (!res.ok) return setError(res.error);
      draft.clear();
      toast.success("노트를 저장했어요");
      onDone();
    });

  return (
    <form
      className="grid gap-5 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-1">
        <SheetTitle>{label} 노트</SheetTitle>
        <SheetDescription>선생님 노트는 학생에게 보이지 않아요.</SheetDescription>
      </div>

      <label className="grid gap-1.5 text-sm font-medium">
        선생님 노트
        <textarea
          {...props}
          onChange={onChange}
          onKeyDown={(e) => {
            // ⌘/Ctrl + Enter로 저장
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          autoFocus
          maxLength={NOTE_MAX}
          rows={12}
          placeholder="피드백, 숙제를 적어요"
          className="min-h-64 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <span className="text-xs font-normal text-muted-foreground">⌘ + Enter로 저장해요.</span>
      </label>

      <div className="grid gap-1.5 text-sm">
        <span className="font-medium">{studentName} 노트</span>
        {student ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 leading-relaxed whitespace-pre-line">{student}</p>
        ) : (
          <p className="text-muted-foreground">아직 쓰지 않았어요.</p>
        )}
      </div>

      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장하는 중..." : "저장"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          닫기
        </Button>
      </div>
    </form>
  );
}
