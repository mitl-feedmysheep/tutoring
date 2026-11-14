"use client";

import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Pencil, Search, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { askConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMaterialAction, setMaterialAccessAction } from "@/app/admin/file-actions";
import { MaterialFormModal } from "./material-form";

export type PanelFile = { id: string; fileName: string; description: string | null; meta: string };
export type PanelStudent = { id: string; name: string };

// 자료실 목록 오른쪽 칸 (FILE-03, 04): 고른 자료의 학생 리스트에서 바로 체크해서 공유한다.
// 위에는 PDF 열기, 제목·설명 수정(모달), 지우기
export function MaterialPanel({
  file,
  students,
  shared,
  onClose,
}: {
  file: PanelFile;
  students: PanelStudent[];
  shared: Record<string, string>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="font-semibold break-all">{file.fileName}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">{file.meta}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X className="size-4" />
        </button>
      </div>
      {file.description && <p className="line-clamp-3 rounded-md bg-slate-50 px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">{file.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        <a href={`/admin/files/${file.id}/view`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">
          <ExternalLink className="size-3.5" />
          PDF 열기
        </a>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
          수정
        </Button>
        <DeleteMaterialButton fileId={file.id} name={file.fileName} onDeleted={onClose} />
      </div>

      <AccessEditor key={`${file.id}:${Object.keys(shared).sort().join(",")}`} fileId={file.id} students={students} shared={shared} />

      {editing && <MaterialFormModal edit={file} onClose={() => setEditing(false)} />}
    </div>
  );
}

// 학생 이름으로 찾고, 체크해서 공유한다. 체크를 빼고 저장하면 공유를 거둔다. "모두 선택"은 지금 보이는(검색된) 학생만
function AccessEditor({ fileId, students, shared }: { fileId: string; students: PanelStudent[]; shared: Record<string, string> }) {
  const saved = useMemo(() => Object.keys(shared), [shared]);
  const [picked, setPicked] = useState(() => new Set(saved));
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const changed = picked.size !== saved.length || saved.some((id) => !picked.has(id));

  const q = query.trim().toLowerCase();
  const shown = q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students;
  const allShown = shown.length > 0 && shown.every((s) => picked.has(s.id));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleShown = () =>
    setPicked((p) => {
      const next = new Set(p);
      for (const s of shown) {
        if (allShown) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const save = () =>
    start(async () => {
      const res = await setMaterialAccessAction(fileId, [...picked]);
      if (!res.ok) return void toast.error(res.error);
      toast.success(picked.size ? `${picked.size}명에게 공유했어요` : "모두 공유를 거뒀어요");
    });

  if (students.length === 0) return <p className="text-sm text-muted-foreground">아직 가입한 학생이 없어요.</p>;

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학생 이름 검색" aria-label="학생 이름 검색" className="pl-9" />
      </div>
      <div className="rounded-lg border bg-background">
        <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-emerald-600" checked={allShown} disabled={shown.length === 0} onChange={toggleShown} />
          {q ? "검색한 학생 모두 선택" : "모두 선택"}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {picked.size}/{students.length}명
          </span>
        </label>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">&quot;{query.trim()}&quot; 학생이 없어요.</p>
        ) : (
          <ul className="max-h-[60dvh] divide-y overflow-y-auto">
            {shown.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                  <input type="checkbox" className="size-4 accent-emerald-600" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${s.name}에게 공유`} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {shared[s.id] && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shared[s.id]} 공유</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <Button type="button" disabled={!changed || pending} onClick={save} className="w-full">
          {pending ? "저장하는 중..." : "공유 저장"}
        </Button>
      </div>
    </div>
  );
}

function DeleteMaterialButton({ fileId, name, onDeleted }: { fileId: string; name: string; onDeleted: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 text-xs text-red-700 hover:text-red-700"
      disabled={pending}
      onClick={async () => {
        if (!(await askConfirm({ title: `"${name}"을(를) 지울까요?`, description: "공유한 학생에게서도 사라져요.", confirmLabel: "지우기", destructive: true }))) return;
        start(async () => {
          const res = await deleteMaterialAction(fileId);
          if (!res.ok) return void toast.error(res.error);
          toast.success("자료를 지웠어요");
          onDeleted();
        });
      }}
    >
      <Trash2 className="size-3.5" />
      지우기
    </Button>
  );
}
