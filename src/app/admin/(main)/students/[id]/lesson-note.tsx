"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NoteForm, useNoteSheet, type NoteFormProps } from "@/components/admin/note-form";

// 수업 이력 한 줄 (NOTE-01~03). 위: 수업(children) · 노트 버튼 · 출석(actions), 아래: 노트 미리보기.
// 누르면 오른쪽 창에서 선생님 노트를 쓰고 학생 노트를 본다
export function LessonNoteRow({ children, actions, ...props }: NoteFormProps & { children: React.ReactNode; actions: React.ReactNode }) {
  const { open, setOpen, setDirty, close, done } = useNoteSheet(props.lessonId);
  const { teacher, student } = props;

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
          {open && <NoteForm {...props} onDirty={setDirty} onDone={done} onCancel={() => close(false)} />}
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
