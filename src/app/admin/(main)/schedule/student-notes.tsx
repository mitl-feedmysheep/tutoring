"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, PenLine } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { NoteForm, useNoteSheet } from "@/components/admin/note-form";
import { noteHistoryAction, type NoteHistoryView } from "@/app/admin/lesson-record-actions";

type Props = { lessonId: string; studentId: string; name: string; label: string; started: boolean };

// 일정 화면 수업 상세의 학생 한 명 (NOTE-01, 03). 누르면 오른쪽 창에서 이 수업 노트를 쓰고, 아래에 지난 수업 노트를 본다
// 누를 수 있다는 게 보이도록 카드 모양 버튼으로: 테두리·hover 색·오른쪽 "노트 ›"
export function StudentNoteButton({ sub, ...props }: Props & { sub?: string }) {
  const { open, setOpen, setDirty, close, done } = useNoteSheet(props.lessonId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        <span className="grid min-w-0">
          <span className="truncate font-medium">{props.name}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
          <PenLine className="size-3.5" />
          노트
          <ChevronRight className="size-3.5" />
        </span>
      </button>
      <Sheet open={open} onOpenChange={close}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          {open && <NotesBody {...props} onDirty={setDirty} onDone={done} onCancel={() => close(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function NotesBody({
  lessonId,
  studentId,
  name,
  label,
  started,
  onDirty,
  onDone,
  onCancel,
}: Props & { onDirty: (v: boolean) => void; onDone: () => void; onCancel: () => void }) {
  const [items, setItems] = useState<NoteHistoryView[] | null>(null);

  useEffect(() => {
    let alive = true;
    noteHistoryAction(studentId).then((r) => alive && setItems(r));
    return () => {
      alive = false;
    };
  }, [studentId]);

  if (!items) return <p className="p-6 text-sm text-muted-foreground">불러오는 중...</p>;

  const current = items.find((i) => i.id === lessonId);
  const past = items.filter((i) => i.id !== lessonId);

  return (
    <div className="grid">
      {started && current ? (
        <NoteForm lessonId={lessonId} label={`${name} · ${label}`} studentName={name} teacher={current.teacher} student={current.student} onDirty={onDirty} onDone={onDone} onCancel={onCancel} />
      ) : (
        <div className="grid gap-1 p-6">
          <SheetTitle>
            {name} · {label}
          </SheetTitle>
          <SheetDescription>수업이 시작하면 노트를 쓸 수 있어요.</SheetDescription>
        </div>
      )}

      <section className="grid gap-3 border-t p-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">지난 수업 노트</h3>
          <Link href={`/admin/students/${studentId}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            학생 카드
          </Link>
        </div>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">지난 수업이 없어요.</p>
        ) : (
          <ul className="grid gap-3">
            {past.map((l) => (
              <li key={l.id} className="grid gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {l.label} · {l.fixed ? "고정" : "예약"}
                </span>
                <NoteText who="선생님" text={l.teacher} />
                <NoteText who={name} text={l.student} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NoteText({ who, text }: { who: string; text: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{who} 노트</span>
      {text ? <p className="leading-relaxed whitespace-pre-line">{text}</p> : <p className="text-muted-foreground">없음</p>}
    </div>
  );
}
