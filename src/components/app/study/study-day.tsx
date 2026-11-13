"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { EntryEditor, type EntryView } from "./entry-editor";

let seq = 0;

/** 저장된 내용이 바뀌면 칸을 새로 만든다 (올린 사진이 저장된 사진으로 바뀌도록) */
const versionOf = (e: EntryView) => `${e.id}:${e.minutes}:${e.memo}:${e.photos.map((p) => p.id).join(",")}`;

// 그날 공부 기록 화면 (APP-03). 하루 여러 건 (STUDY-01). 오늘·어제는 바로 쓰고 고친다.
// 기록이 없으면 빈 새 기록 칸 하나로 시작한다
export function StudyDay({ date, entries, locked }: { date: string; entries: EntryView[]; locked: boolean }) {
  const [drafts, setDrafts] = useState<number[]>(() => (entries.length === 0 && !locked ? [seq++] : []));

  return (
    <>
      {entries.map((e, i) => (
        <EntryEditor key={versionOf(e)} date={date} entry={e} draftKey={`study-draft:${date}:${e.id}`} locked={locked} index={i} />
      ))}
      {drafts.map((n, i) => (
        <EntryEditor
          key={`new-${n}`}
          date={date}
          entry={null}
          // 새 기록 칸의 임시 보관은 첫 칸만 (다시 들어왔을 때 어느 칸인지 알 수 있게)
          draftKey={i === 0 ? `study-draft:${date}:new` : `study-draft:${date}:new-${n}`}
          locked={false}
          index={entries.length + i}
          onCreated={() => setDrafts((list) => list.filter((x) => x !== n))}
        />
      ))}
      {!locked && (
        <button
          type="button"
          onClick={() => setDrafts((list) => [...list, seq++])}
          className="flex h-12 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border text-[15px] font-bold text-muted-foreground hover:bg-accent/50"
        >
          <Plus className="size-4" />
          {entries.length + drafts.length > 0 ? "기록 하나 더 쓰기" : "기록 쓰기"}
        </button>
      )}
    </>
  );
}
