"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FormError } from "@/components/auth/auth-card";
import { useBullets } from "@/components/notes/use-bullets";
import { discardNoteDraft, useNoteDraft } from "@/components/notes/use-note-draft";
import { saveTeacherNoteAction } from "@/app/admin/lesson-record-actions";
import { cleanNote, NOTE_MAX } from "@/lib/lessons/note-text";

const draftKey = (lessonId: string) => `note-draft:teacher:${lessonId}`;

type Props = { lessonId: string; label: string; studentName: string; teacher: string; student: string };

// 수업 이력 한 줄 (NOTE-01~03). 위: 수업(children) · 노트 버튼 · 출석(actions), 아래: 노트 미리보기.
// 누르면 오른쪽 창에서 선생님 노트를 쓰고 학생 노트를 본다
export function LessonNoteRow({ children, actions, ...props }: Props & { children: React.ReactNode; actions: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { teacher, student } = props;

  // 저장 안 한 내용이 있으면 닫기 전에 묻는다 (수업 중에 쓴 노트를 실수로 잃지 않게)
  const close = (next: boolean) => {
    if (next) return setOpen(true);
    if (dirty) {
      if (!window.confirm("저장하지 않은 노트가 있어요. 닫을까요?")) return;
      discardNoteDraft(draftKey(props.lessonId));
    }
    setDirty(false);
    setOpen(false);
  };

  return (
    <li className="grid gap-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {children}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setOpen(true)}>
            {teacher ? "노트 고치기" : "노트 쓰기"}
          </Button>
          {actions}
        </div>
      </div>
      {(teacher || student) && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid w-full gap-2 rounded-md bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100 md:grid-cols-2"
        >
          <Preview who="선생님" text={teacher} />
          <Preview who={props.studentName} text={student} />
        </button>
      )}

      <Sheet open={open} onOpenChange={close}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          {open && <NoteForm {...props} onDirty={setDirty} onDone={() => (setDirty(false), setOpen(false))} onCancel={() => close(false)} />}
        </SheetContent>
      </Sheet>
    </li>
  );
}

function Preview({ who, text }: { who: string; text: string }) {
  return (
    <span className="grid min-w-0 content-start gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{who} 노트</span>
      {text ? <span className="line-clamp-3 whitespace-pre-line">{text}</span> : <span className="text-muted-foreground">없음</span>}
    </span>
  );
}

function NoteForm({
  lessonId,
  label,
  studentName,
  teacher,
  student,
  onDirty,
  onDone,
  onCancel,
}: Props & { onDirty: (v: boolean) => void; onDone: () => void; onCancel: () => void }) {
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
